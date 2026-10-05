"""GET /api/v1/reports/{order_id}/download (app.reports.router)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models import Order, OrderStatus, Report
from app.reports import storage
from app.reports.preview import sample_order
from app.security import hash_token, new_report_file_key, new_token
from app.utils import utcnow

PDF_BYTES = b"%PDF-1.7\n" + b"x" * 200_000 + b"\n%%EOF\n"  # several stream chunks


@dataclass
class ReadyReport:
    order: Order
    report: Report
    browser_token: str
    email_token: str

    @property
    def url(self) -> str:
        return f"/api/v1/reports/{self.order.id}/download"


def _make_ready(db, *, status: OrderStatus = OrderStatus.READY, with_report: bool = True) -> ReadyReport:
    browser_token, email_token = new_token(), new_token()
    order = sample_order("en", status=status, access_token_hash=hash_token(browser_token))
    db.add(order)
    db.flush()
    report = None
    if with_report:
        file_key = new_report_file_key()
        storage.save_report(file_key, PDF_BYTES)
        report = Report(
            order_id=order.id,
            file_key=file_key,
            size_bytes=len(PDF_BYTES),
            sha256="0" * 64,
            email_token_hash=hash_token(email_token),
            expires_at=utcnow() + timedelta(hours=24),
        )
        db.add(report)
    db.commit()
    return ReadyReport(order, report, browser_token, email_token)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def ready(db) -> ReadyReport:
    return _make_ready(db)


def test_download_with_browser_token(client, db, ready):
    r = client.get(ready.url, headers=_auth(ready.browser_token))
    assert r.status_code == 200
    assert r.content == PDF_BYTES
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"] == 'attachment; filename="ZodiacBlend-Report.pdf"'
    assert r.headers["content-length"] == str(len(PDF_BYTES))
    assert "no-store" in r.headers["cache-control"]
    assert "private" in r.headers["cache-control"]
    assert "noindex" in r.headers["x-robots-tag"]
    assert r.headers["x-content-type-options"] == "nosniff"

    db.expire_all()
    report = db.get(Report, ready.report.id)
    assert report.download_count == 1
    assert report.last_download_at is not None


def test_download_with_email_token(client, db, ready):
    r = client.get(ready.url, headers=_auth(ready.email_token))
    assert r.status_code == 200
    assert r.content == PDF_BYTES
    r = client.get(ready.url, headers=_auth(ready.email_token))
    assert r.status_code == 200
    db.expire_all()
    assert db.get(Report, ready.report.id).download_count == 2


def test_bearer_scheme_is_case_insensitive(client, ready):
    r = client.get(ready.url, headers={"Authorization": f"bearer   {ready.browser_token}"})
    assert r.status_code == 200


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer "},
        {"Authorization": "Bearer wrong-token"},
        {"Authorization": "Basic dXNlcjpwYXNz"},
        {"Authorization": "Bearer " + "a" * 5000},
    ],
)
def test_bad_or_missing_token_is_404(client, ready, headers):
    r = client.get(ready.url, headers=headers)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_token_is_not_accepted_from_query_string_or_other_headers(client, ready):
    assert client.get(f"{ready.url}?token={ready.browser_token}").status_code == 404
    assert client.get(f"{ready.url}?t={ready.browser_token}").status_code == 404
    assert client.get(ready.url, headers={"X-Order-Token": ready.browser_token}).status_code == 404


def test_token_of_another_order_is_rejected(client, db, ready):
    other = _make_ready(db)
    r = client.get(ready.url, headers=_auth(other.browser_token))
    assert r.status_code == 404
    r = client.get(ready.url, headers=_auth(other.email_token))
    assert r.status_code == 404


def test_unknown_order_and_wrong_token_look_identical(client, ready):
    wrong_token = client.get(ready.url, headers=_auth("nope"))
    unknown = client.get(f"/api/v1/reports/{uuid.uuid4()}/download", headers=_auth(ready.browser_token))
    malformed = client.get("/api/v1/reports/not-a-uuid/download", headers=_auth(ready.browser_token))
    assert wrong_token.status_code == unknown.status_code == malformed.status_code == 404
    assert wrong_token.json() == unknown.json() == malformed.json()
    assert "no-store" in wrong_token.headers["cache-control"]


@pytest.mark.parametrize(
    "status", [OrderStatus.PAID, OrderStatus.QUEUED, OrderStatus.GENERATING, OrderStatus.GENERATION_FAILED]
)
def test_not_ready_is_409(client, db, status):
    pending = _make_ready(db, status=status, with_report=False)
    r = client.get(pending.url, headers=_auth(pending.browser_token))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "report_not_ready"


def test_not_ready_requires_valid_token(client, db):
    pending = _make_ready(db, status=OrderStatus.GENERATING, with_report=False)
    assert client.get(pending.url, headers=_auth("wrong")).status_code == 404


def test_expired_window_is_410(client, db, ready):
    ready.report.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    r = client.get(ready.url, headers=_auth(ready.browser_token))
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "report_expired"


def test_expired_window_with_email_token_is_410(client, db, ready):
    ready.report.expires_at = utcnow() - timedelta(minutes=5)
    db.commit()
    assert client.get(ready.url, headers=_auth(ready.email_token)).status_code == 410


@pytest.mark.parametrize("status", [OrderStatus.EXPIRED, OrderStatus.REFUNDED])
def test_expired_or_refunded_order_is_410(client, db, ready, status):
    ready.order.status = status
    db.commit()
    r = client.get(ready.url, headers=_auth(ready.browser_token))
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "report_expired"


def test_deleted_report_is_410(client, db, ready):
    ready.report.deleted_at = utcnow()
    db.commit()
    assert client.get(ready.url, headers=_auth(ready.browser_token)).status_code == 410


def test_missing_file_is_410(client, ready):
    storage.delete_report(ready.report.file_key)
    assert client.get(ready.url, headers=_auth(ready.browser_token)).status_code == 410


def test_failed_attempts_do_not_count_as_downloads(client, db, ready):
    client.get(ready.url, headers=_auth("wrong"))
    db.expire_all()
    assert db.scalar(select(Report.download_count).where(Report.id == ready.report.id)) == 0


def test_rotated_email_token_stops_working(client, db, ready):
    ready.report.email_token_hash = hash_token(new_token())
    db.commit()
    assert client.get(ready.url, headers=_auth(ready.email_token)).status_code == 404
    assert client.get(ready.url, headers=_auth(ready.browser_token)).status_code == 200


def test_download_is_rate_limited_per_ip(client, ready):
    for _ in range(30):
        assert client.get(ready.url, headers=_auth("wrong")).status_code == 404
    r = client.get(ready.url, headers=_auth(ready.browser_token))
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    # Another client IP is not affected.
    r = client.get(ready.url, headers={**_auth(ready.browser_token), "X-Forwarded-For": "203.0.113.9"})
    assert r.status_code == 200


def test_post_is_not_allowed(client, ready):
    assert client.post(ready.url, headers=_auth(ready.browser_token)).status_code == 405
