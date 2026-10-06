"""Worker jobs of the reports module: send_report_email, cleanup, and the email backends."""

from __future__ import annotations

import os
import re
import smtplib
import stat
import time
from datetime import UTC, date, datetime, timedelta
from datetime import time as dtime
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from pathlib import Path
from typing import ClassVar

import pytest
from sqlalchemy import select, text

from app.charts.schemas import Chart
from app.config import get_settings
from app.db import Base
from app.jobs.queue import CLEANUP, SEND_REPORT_EMAIL, claim_next, enqueue
from app.jobs.registry import PermanentJobError, get_handler
from app.models import (
    AdminSession,
    FreeReadingRequest,
    Job,
    JobStatus,
    LoginAttempt,
    Order,
    OrderStatus,
    Report,
)
from app.reports import emailer, jobs, storage
from app.reports.preview import sample_order
from app.reports.report_email import format_expiry, report_download_url
from app.security import hash_token, new_report_file_key
from app.settings_store import set_settings
from app.utils import utcnow

PDF_BYTES = b"%PDF-1.7\nreport\n%%EOF\n"
LINK_RE = re.compile(
    r"http://testserver/(?P<locale>[a-z]{2})/report/(?P<order>[0-9a-f-]{36})#t=(?P<token>[A-Za-z0-9_-]+)"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ready_order(
    db,
    locale: str = "en",
    *,
    expires_in: timedelta = timedelta(hours=24),
    status: OrderStatus = OrderStatus.READY,
    display_name: str | None = "Layla",
) -> tuple[Order, Report]:
    order = sample_order(locale, status=status, display_name=display_name)
    db.add(order)
    db.flush()
    file_key = new_report_file_key()
    storage.save_report(file_key, PDF_BYTES)
    report = Report(
        order_id=order.id,
        file_key=file_key,
        size_bytes=len(PDF_BYTES),
        sha256="0" * 64,
        expires_at=utcnow() + expires_in,
    )
    db.add(report)
    db.commit()
    return order, report


def _email_job(db, order: Order) -> Job:
    enqueue(db, SEND_REPORT_EMAIL, {"order_id": str(order.id)})
    db.commit()
    job = claim_next(db, "test-worker", 60, kinds=[SEND_REPORT_EMAIL])
    db.commit()
    assert job is not None
    return job


def _outbox() -> list[Path]:
    directory = emailer.outbox_dir()
    return sorted(directory.glob("*.eml")) if directory.exists() else []


def _read_eml(path: Path) -> EmailMessage:
    return BytesParser(policy=policy.default).parsebytes(path.read_bytes())


def _all_db_text(db) -> str:
    chunks = []
    for table in Base.metadata.sorted_tables:
        for row in db.execute(text(f'SELECT * FROM "{table.name}"')):
            chunks.append(repr(tuple(row)))
    return "\n".join(chunks)


# ---------------------------------------------------------------------------
# send_report_email
# ---------------------------------------------------------------------------


def test_handler_registry_points_to_this_module():
    assert get_handler(SEND_REPORT_EMAIL) is jobs.handle_send_report_email
    assert get_handler(CLEANUP) is jobs.handle_cleanup


def test_send_report_email_writes_eml_with_secure_link(client, db):
    order, report = _ready_order(db, "en")
    jobs.handle_send_report_email(db, _email_job(db, order))

    files = _outbox()
    assert len(files) == 1
    assert stat.S_IMODE(files[0].stat().st_mode) == 0o600
    message = _read_eml(files[0])
    assert message["To"] == order.email
    assert message["Subject"] == "Your Zodiac Blend report is ready"
    assert message["From"] == get_settings().email_from
    assert message.get_content_type() == "multipart/alternative"
    plain = message.get_body(("plain",)).get_content()
    html = message.get_body(("html",)).get_content()
    assert not list(message.iter_attachments())

    match = LINK_RE.search(plain)
    assert match is not None, plain
    assert match["locale"] == "en"
    assert match["order"] == str(order.id)
    token = match["token"]
    assert f"#t={token}" in html
    assert "Dear Layla," in plain
    # The exact expiry instant is in both parts.
    db.expire_all()
    report = db.get(Report, report.id)
    expiry_text = format_expiry(report.expires_at, "en")
    assert expiry_text in plain
    assert expiry_text in html

    # Only the hash is stored, and the raw token appears in no column of any table.
    assert report.email_token_hash == hash_token(token)
    assert report.email_sent_at is not None
    assert token not in _all_db_text(db)

    # The emailed token downloads the report.
    r = client.get(f"/api/v1/reports/{order.id}/download", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.content == PDF_BYTES


def test_send_report_email_never_logs_token(db, caplog):
    order, _ = _ready_order(db, "en")
    with caplog.at_level("DEBUG"):
        jobs.handle_send_report_email(db, _email_job(db, order))
    token = LINK_RE.search(_read_eml(_outbox()[0]).get_body(("plain",)).get_content())["token"]
    assert token not in caplog.text
    assert order.email not in caplog.text


def test_send_report_email_arabic_is_rtl(db):
    order, _ = _ready_order(db, "ar", display_name="ليلى")
    jobs.handle_send_report_email(db, _email_job(db, order))
    message = _read_eml(_outbox()[0])
    assert message["Subject"] == "تقرير زودياك بلند الخاص بك جاهز"
    html = message.get_body(("html",)).get_content()
    plain = message.get_body(("plain",)).get_content()
    assert '<html lang="ar" dir="rtl">' in html
    assert "عزيزنا ليلى،" in plain
    assert LINK_RE.search(plain)["locale"] == "ar"


def test_send_report_email_escapes_display_name(db):
    order, _ = _ready_order(db, "en", display_name='<a href="https://evil.example">x</a>')
    jobs.handle_send_report_email(db, _email_job(db, order))
    html = _read_eml(_outbox()[0]).get_body(("html",)).get_content()
    assert 'href="https://evil.example"' not in html
    assert "&lt;a href=" in html


def test_send_report_email_rotates_token(client, db):
    order, _ = _ready_order(db, "en")
    jobs.handle_send_report_email(db, _email_job(db, order))
    first = LINK_RE.search(_read_eml(_outbox()[0]).get_body(("plain",)).get_content())["token"]
    jobs.handle_send_report_email(db, _email_job(db, order))
    files = _outbox()
    assert len(files) == 2
    tokens = {LINK_RE.search(_read_eml(f).get_body(("plain",)).get_content())["token"] for f in files}
    second = (tokens - {first}).pop()
    url = f"/api/v1/reports/{order.id}/download"
    assert client.get(url, headers={"Authorization": f"Bearer {first}"}).status_code == 404
    assert client.get(url, headers={"Authorization": f"Bearer {second}"}).status_code == 200


def test_pdf_is_attached_only_when_enabled(db):
    order, _ = _ready_order(db, "en")
    set_settings(db, {"email_attach_pdf": True})
    db.commit()
    jobs.handle_send_report_email(db, _email_job(db, order))
    message = _read_eml(_outbox()[0])
    assert message.get_content_type() == "multipart/mixed"
    attachments = list(message.iter_attachments())
    assert len(attachments) == 1
    assert attachments[0].get_filename() == "ZodiacBlend-Report.pdf"
    assert attachments[0].get_content_type() == "application/pdf"
    assert attachments[0].get_content() == PDF_BYTES
    assert "attached to this email" in message.get_body(("plain",)).get_content()


@pytest.mark.parametrize(
    "setup",
    [
        lambda o, r: setattr(r, "expires_at", utcnow() - timedelta(minutes=1)),
        lambda o, r: setattr(r, "deleted_at", utcnow()),
        lambda o, r: setattr(o, "status", OrderStatus.REFUNDED),
        lambda o, r: setattr(o, "status", OrderStatus.EXPIRED),
    ],
    ids=["expired", "deleted", "refunded", "order-expired"],
)
def test_send_report_email_skips_unavailable_reports(db, setup):
    order, report = _ready_order(db, "en")
    setup(order, report)
    db.commit()
    jobs.handle_send_report_email(db, _email_job(db, order))
    assert _outbox() == []
    db.expire_all()
    assert db.get(Report, report.id).email_token_hash is None


def test_send_report_email_skips_order_without_report(db):
    order = sample_order("en", status=OrderStatus.GENERATING)
    db.add(order)
    db.commit()
    jobs.handle_send_report_email(db, _email_job(db, order))
    assert _outbox() == []


def test_send_report_email_permanent_errors(db):
    with pytest.raises(PermanentJobError):
        jobs.handle_send_report_email(db, Job(kind=SEND_REPORT_EMAIL, payload={"order_id": "not-a-uuid"}))
    with pytest.raises(PermanentJobError):
        jobs.handle_send_report_email(db, Job(kind=SEND_REPORT_EMAIL, payload={}))
    with pytest.raises(PermanentJobError):
        jobs.handle_send_report_email(
            db, Job(kind=SEND_REPORT_EMAIL, payload={"order_id": "00000000-0000-0000-0000-000000000000"})
        )
    order, report = _ready_order(db, "en")
    storage.delete_report(report.file_key)
    with pytest.raises(PermanentJobError):
        jobs.handle_send_report_email(db, _email_job(db, order))


def test_undeliverable_address_fails_permanently(db):
    order, _ = _ready_order(db, "en")
    order.email = "broken@example.com\r\nBcc: victim@example.com"
    db.commit()
    with pytest.raises(PermanentJobError):
        jobs.handle_send_report_email(db, _email_job(db, order))
    assert _outbox() == []


def test_send_report_email_through_worker(db):
    from app.worker import run_once

    order, report = _ready_order(db, "en")
    enqueue(db, SEND_REPORT_EMAIL, {"order_id": str(order.id)}, dedupe_key=f"send_report_email:{order.id}")
    db.commit()
    assert run_once("test-worker") is True
    db.expire_all()
    job = db.scalar(select(Job).where(Job.kind == SEND_REPORT_EMAIL))
    assert job.status == JobStatus.DONE
    assert db.get(Report, report.id).email_sent_at is not None
    assert len(_outbox()) == 1


def test_permanent_email_errors_are_not_retried_by_worker(db):
    from app.worker import run_once

    enqueue(db, SEND_REPORT_EMAIL, {"order_id": "00000000-0000-0000-0000-000000000000"})
    db.commit()
    assert run_once("test-worker") is True
    db.expire_all()
    job = db.scalar(select(Job).where(Job.kind == SEND_REPORT_EMAIL))
    assert job.status == JobStatus.FAILED
    assert job.attempts == 1


def test_send_failure_is_retryable_and_keeps_report(db, monkeypatch):
    order, report = _ready_order(db, "en")

    def _fail(*args, **kwargs):
        raise emailer.EmailSendError("SMTP delivery failed")

    monkeypatch.setattr(jobs, "send_email", _fail)
    with pytest.raises(emailer.EmailSendError):
        jobs.handle_send_report_email(db, _email_job(db, order))
    db.expire_all()
    assert db.get(Report, report.id).email_sent_at is None


def test_download_url_and_expiry_format():
    order_id = "4f3c2a1e-0000-4000-8000-000000000001"
    assert report_download_url(order_id, "ar-EG", "tok") == f"http://testserver/ar/report/{order_id}#t=tok"
    moment = datetime(2026, 10, 6, 14, 30, tzinfo=UTC)
    assert format_expiry(moment, "en") == "October 6, 2026, 2:30 PM UTC"
    assert format_expiry(moment, "ar").endswith("UTC")
    assert "2026" in format_expiry(moment, "xx")


# ---------------------------------------------------------------------------
# Email backends
# ---------------------------------------------------------------------------


class FakeSMTP:
    instances: ClassVar[list[FakeSMTP]] = []
    fail_with: ClassVar[Exception | None] = None

    def __init__(self, host, port, timeout):
        self.host, self.port, self.timeout = host, port, timeout
        self.calls: list[str] = []
        self.sent: list[EmailMessage] = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.calls.append("quit")

    def ehlo(self):
        self.calls.append("ehlo")

    def starttls(self, context):
        assert context is not None
        self.calls.append("starttls")

    def login(self, username, password):
        self.calls.append(f"login:{username}")

    def send_message(self, message):
        if FakeSMTP.fail_with:
            raise FakeSMTP.fail_with
        self.sent.append(message)


@pytest.fixture
def fake_smtp(monkeypatch):
    FakeSMTP.instances = []
    FakeSMTP.fail_with = None
    settings = get_settings()
    monkeypatch.setattr(settings, "email_backend", "smtp")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 2525)
    monkeypatch.setattr(settings, "smtp_username", "mailer")
    monkeypatch.setattr(settings, "smtp_password", "secret")
    monkeypatch.setattr(settings, "smtp_starttls", True)
    monkeypatch.setattr(emailer.smtplib, "SMTP", FakeSMTP)
    return FakeSMTP


def test_smtp_backend_uses_starttls_and_login(fake_smtp):
    message_id = emailer.send_email(
        "user@example.com", "Hi", "plain", "<p>html</p>", [("a.pdf", b"%PDF", "application/pdf")]
    )
    smtp = fake_smtp.instances[0]
    assert (smtp.host, smtp.port, smtp.timeout) == ("smtp.example.com", 2525, 30)
    assert smtp.calls == ["ehlo", "starttls", "ehlo", "login:mailer", "quit"]
    sent = smtp.sent[0]
    assert sent["Message-ID"] == message_id
    assert sent["To"] == "user@example.com"
    assert [a.get_filename() for a in sent.iter_attachments()] == ["a.pdf"]
    assert _outbox() == []


def test_smtp_without_tls_or_auth(fake_smtp, monkeypatch):
    monkeypatch.setattr(get_settings(), "smtp_starttls", False)
    monkeypatch.setattr(get_settings(), "smtp_username", "")
    emailer.send_email("user@example.com", "Hi", "plain", "<p>html</p>")
    assert fake_smtp.instances[0].calls == ["ehlo", "quit"]


@pytest.mark.parametrize(
    "error",
    [
        smtplib.SMTPServerDisconnected("gone"),
        smtplib.SMTPRecipientsRefused({"user@example.com": (550, b"no")}),
        ConnectionRefusedError(),
        TimeoutError(),
    ],
)
def test_smtp_failures_raise_retryable_error(fake_smtp, error):
    fake_smtp.fail_with = error
    with pytest.raises(emailer.EmailSendError) as info:
        emailer.send_email("user@example.com", "Hi", "plain", "<p>html</p>")
    assert "user@example.com" not in str(info.value)


@pytest.mark.parametrize(
    "address",
    [
        "user@example.com\r\nBcc: victim@example.com",
        "a@b.com, c@d.com",
        "Name <a@b.com>",
        "no-at-sign",
        "a@b.com;c@d.com",
    ],
)
def test_recipient_header_injection_is_rejected(address):
    with pytest.raises(emailer.InvalidEmailAddress):
        emailer.send_email(address, "Hi", "plain", "<p>html</p>")
    assert _outbox() == []


def test_console_backend_message_structure():
    emailer.send_email("user@example.com", "Hello", "plain body", "<p>html body</p>")
    files = _outbox()
    assert len(files) == 1
    assert stat.S_IMODE(files[0].parent.stat().st_mode) == 0o700
    message = _read_eml(files[0])
    assert message.get_content_type() == "multipart/alternative"
    assert message.get_body(("plain",)).get_content().strip() == "plain body"
    assert message["Reply-To"] == get_settings().email_reply_to
    assert message["Auto-Submitted"] == "auto-generated"


# ---------------------------------------------------------------------------
# cleanup
# ---------------------------------------------------------------------------


def _unpaid_order(db, *, age: timedelta, status: OrderStatus = OrderStatus.AWAITING_PAYMENT) -> Order:
    order = sample_order("en", status=status)
    order.created_at = utcnow() - age
    db.add(order)
    db.commit()
    return order


def _order_with_birth_data(db, *, age: timedelta) -> Order:
    order = sample_order("en", status=OrderStatus.READY, display_name="Layla")
    order.created_at = utcnow() - age
    order.birth_date = date(1990, 8, 17)
    order.birth_time = dtime(14, 30)
    order.place_label = "Cairo, Egypt"
    order.latitude = 30.06
    order.longitude = 31.25
    order.timezone = "Africa/Cairo"
    order.birth_utc = datetime(1990, 8, 17, 11, 30, tzinfo=UTC)
    db.add(order)
    db.commit()
    return order


def test_cleanup_expires_reports_and_deletes_files(db):
    expired_order, expired_report = _ready_order(db, expires_in=-timedelta(minutes=1))
    live_order, live_report = _ready_order(db, expires_in=timedelta(hours=3))
    expired_report.email_token_hash = "e" * 64
    db.commit()

    result = jobs.run_cleanup(db)
    assert result.reports_expired == 1

    db.expire_all()
    assert not storage.report_exists(expired_report.file_key)
    report = db.get(Report, expired_report.id)
    assert report.deleted_at is not None
    assert report.email_token_hash is None
    assert db.get(Order, expired_order.id).status == OrderStatus.EXPIRED

    assert storage.report_exists(live_report.file_key)
    assert db.get(Report, live_report.id).deleted_at is None
    assert db.get(Order, live_order.id).status == OrderStatus.READY


def test_cleanup_deletes_refunded_report_files(db):
    order, report = _ready_order(db, status=OrderStatus.REFUNDED)
    jobs.run_cleanup(db)
    db.expire_all()
    assert not storage.report_exists(report.file_key)
    assert db.get(Report, report.id).deleted_at is not None
    assert db.get(Order, order.id).status == OrderStatus.REFUNDED


def test_cleanup_tolerates_already_missing_files(db):
    order, report = _ready_order(db, expires_in=-timedelta(hours=1))
    storage.delete_report(report.file_key)
    assert jobs.run_cleanup(db).reports_expired == 1
    db.expire_all()
    assert db.get(Order, order.id).status == OrderStatus.EXPIRED


def test_cleanup_abandons_old_unpaid_orders(db):
    old = _unpaid_order(db, age=timedelta(hours=49))
    recent = _unpaid_order(db, age=timedelta(hours=1))
    old_paid = _unpaid_order(db, age=timedelta(hours=72), status=OrderStatus.QUEUED)

    assert jobs.run_cleanup(db).orders_abandoned == 1
    db.expire_all()
    assert db.get(Order, old.id).status == OrderStatus.ABANDONED
    assert db.get(Order, recent.id).status == OrderStatus.AWAITING_PAYMENT
    assert db.get(Order, old_paid.id).status == OrderStatus.QUEUED


def test_cleanup_abandon_threshold_is_a_setting(db):
    set_settings(db, {"abandoned_order_hours": 2})
    db.commit()
    order = _unpaid_order(db, age=timedelta(hours=3))
    jobs.run_cleanup(db)
    db.expire_all()
    assert db.get(Order, order.id).status == OrderStatus.ABANDONED


def test_cleanup_abandons_in_batches(db, monkeypatch):
    monkeypatch.setattr(jobs, "BATCH_SIZE", 2)
    orders = [_unpaid_order(db, age=timedelta(days=3)) for _ in range(5)]
    assert jobs.run_cleanup(db).orders_abandoned == 5
    db.expire_all()
    assert {db.get(Order, o.id).status for o in orders} == {OrderStatus.ABANDONED}


def test_cleanup_purges_personal_data_but_keeps_signs(db):
    old = _order_with_birth_data(db, age=timedelta(days=31))
    recent = _order_with_birth_data(db, age=timedelta(days=29))
    old_request = FreeReadingRequest(
        email="lead@example.com",
        locale="en",
        birth_date=date(1990, 8, 17),
        sun_sign="leo",
        year_animal="horse",
        created_at=utcnow() - timedelta(days=40),
    )
    new_request = FreeReadingRequest(
        email="lead2@example.com", locale="en", birth_date=date(1991, 1, 1), sun_sign="capricorn", year_animal="horse"
    )
    db.add_all([old_request, new_request])
    db.commit()

    result = jobs.run_cleanup(db)
    assert result.orders_purged == 1
    assert result.free_requests_purged == 1

    db.expire_all()
    purged = db.get(Order, old.id)
    for field in (
        "birth_date",
        "birth_time",
        "city_id",
        "place_label",
        "latitude",
        "longitude",
        "timezone",
        "birth_utc",
        "display_name",
    ):
        assert getattr(purged, field) is None, field
    assert purged.chart["input"] is None
    assert purged.chart["western"]["sun"]["sign"] == "leo"
    assert purged.chart["chinese"]["year"]["animal"] == "horse"
    chart = Chart.model_validate(purged.chart)  # purged charts remain valid for every reader
    assert chart.input is None
    assert chart.western.moon.sign == "pisces"
    assert "Cairo" not in repr(purged.chart)
    assert purged.personal_data_purged_at is not None
    assert purged.email == old.email  # needed for receipts/support

    kept = db.get(Order, recent.id)
    assert kept.birth_date == date(1990, 8, 17)
    assert kept.chart["input"]["timezone"] == "Africa/Cairo"
    assert kept.personal_data_purged_at is None

    assert db.get(FreeReadingRequest, old_request.id).birth_date is None
    assert db.get(FreeReadingRequest, old_request.id).sun_sign == "leo"
    assert db.get(FreeReadingRequest, new_request.id).birth_date == date(1991, 1, 1)


def test_cleanup_deletes_stale_sessions_attempts_and_jobs(db, make_admin):
    admin = make_admin("owner")
    now = utcnow()
    db.add_all(
        [
            AdminSession(user_id=admin.id, token_hash="1" * 64, expires_at=now - timedelta(minutes=1)),
            AdminSession(user_id=admin.id, token_hash="2" * 64, expires_at=now + timedelta(hours=1)),
            LoginAttempt(email="a@example.com", success=False, created_at=now - timedelta(days=31)),
            LoginAttempt(email="a@example.com", success=False, created_at=now - timedelta(days=1)),
            LoginAttempt(email="a@example.com", success=True, created_at=now - timedelta(days=29)),
            Job(kind="cleanup", status=JobStatus.DONE, finished_at=now - timedelta(days=31)),
            Job(kind="cleanup", status=JobStatus.FAILED, finished_at=now - timedelta(days=45)),
            Job(kind="cleanup", status=JobStatus.DONE, finished_at=now - timedelta(days=2)),
            Job(kind="cleanup", status=JobStatus.PENDING),
        ]
    )
    db.commit()

    result = jobs.run_cleanup(db)
    assert (result.admin_sessions_deleted, result.login_attempts_deleted, result.jobs_deleted) == (1, 1, 2)
    db.expire_all()
    assert [s.token_hash for s in db.scalars(select(AdminSession))] == ["2" * 64]
    assert len(db.scalars(select(LoginAttempt)).all()) == 2  # kept for at least 24 h (30 days)
    assert sorted(j.status.value for j in db.scalars(select(Job))) == ["done", "pending"]


def test_cleanup_removes_orphan_files_after_grace_period(db):
    _, live = _ready_order(db)
    directory = get_settings().reports_dir
    old_orphan = new_report_file_key()
    new_orphan = new_report_file_key()
    storage.save_report(old_orphan, b"orphan")
    storage.save_report(new_orphan, b"orphan")
    stale_tmp = directory / ".tmp-abandoned.pdf"
    stale_tmp.write_bytes(b"partial")
    unrelated = directory / "README.txt"
    unrelated.write_text("keep me")
    two_hours_ago = time.time() - 7200
    for path in (storage.report_path(old_orphan), storage.report_path(live.file_key), stale_tmp, unrelated):
        os.utime(path, (two_hours_ago, two_hours_ago))

    jobs.run_cleanup(db)
    assert not storage.report_exists(old_orphan)
    assert not stale_tmp.exists()
    assert storage.report_exists(new_orphan)  # may still be committing
    assert storage.report_exists(live.file_key)
    assert unrelated.exists()


def test_cleanup_is_idempotent(db, make_admin):
    _ready_order(db, expires_in=-timedelta(minutes=5))
    _unpaid_order(db, age=timedelta(days=3))
    _order_with_birth_data(db, age=timedelta(days=60))

    first = jobs.run_cleanup(db)
    assert first.reports_expired == 1
    assert first.orders_abandoned == 1
    assert first.orders_purged == 1  # only the 60-day-old order is past the 30-day retention
    snapshot = _all_db_text(db)

    second = jobs.run_cleanup(db)
    assert second.model_dump() == dict.fromkeys(second.model_dump(), 0)
    db.expire_all()
    assert _all_db_text(db) == snapshot


def test_cleanup_without_reports_dir(db):
    assert not get_settings().reports_dir.exists()
    assert jobs.run_cleanup(db).model_dump() == dict.fromkeys(jobs.run_cleanup(db).model_dump(), 0)


def test_handle_cleanup_through_registry(db):
    order, _ = _ready_order(db, expires_in=-timedelta(minutes=1))
    enqueue(db, CLEANUP, {}, dedupe_key="cleanup:test")
    db.commit()
    job = claim_next(db, "test-worker", 60, kinds=[CLEANUP])
    db.commit()
    get_handler(job.kind)(db, job)
    db.expire_all()
    assert db.get(Order, order.id).status == OrderStatus.EXPIRED


@pytest.mark.parametrize("status", [OrderStatus.PAID, OrderStatus.QUEUED, OrderStatus.GENERATING])
def test_cleanup_keeps_birth_data_of_orders_in_fulfilment(db, status):
    order = _order_with_birth_data(db, age=timedelta(days=45))
    order.status = status
    db.commit()
    assert jobs.run_cleanup(db).orders_purged == 0
    db.expire_all()
    assert db.get(Order, order.id).birth_date == date(1990, 8, 17)
