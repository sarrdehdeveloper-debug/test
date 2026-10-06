"""Admin orders API: roles, search, detail, generation retry, e-mail resend, access extension, dashboard, jobs."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from functools import lru_cache

import pytest
from sqlalchemy import select

from app import settings_store
from app.charts.service import Place, build_chart
from app.config import get_settings
from app.models import (
    AuditLog,
    DiscountCode,
    DiscountKind,
    FreeReadingRequest,
    Job,
    JobStatus,
    Order,
    OrderStatus,
    PaymentEvent,
    Report,
    ReportSection,
    SectionStatus,
)
from app.reports import storage
from app.security import hash_token, new_report_file_key
from app.utils import utcnow

ADMIN = "/api/v1/admin"


@lru_cache(maxsize=1)
def sample_chart() -> dict:
    place = Place(latitude=30.06263, longitude=31.24967, timezone="Africa/Cairo", label="Cairo, Egypt")
    chart = build_chart(
        date(1990, 8, 17), time(14, 30), place, fold=None, year_boundary="lichun", day_boundary="midnight"
    )
    return chart.model_dump(mode="json")


@pytest.fixture
def make_order(db):
    def _make(
        status: OrderStatus = OrderStatus.QUEUED,
        *,
        email: str = "alice@example.com",
        amount_cents: int = 2900,
        currency: str = "USD",
        created_at: datetime | None = None,
        paid_at: datetime | None = None,
        discount_code_id: int | None = None,
    ) -> Order:
        now = utcnow()
        paid = status not in (OrderStatus.AWAITING_PAYMENT, OrderStatus.ABANDONED)
        order = Order(
            id=uuid.uuid4(),
            status=status,
            email=email,
            locale="en",
            display_name="Alice",
            birth_date=date(1990, 8, 17),
            birth_time=time(14, 30),
            place_label="Cairo, Egypt",
            timezone="Africa/Cairo",
            latitude=30.06263,
            longitude=31.24967,
            chart=sample_chart(),
            calc_version="zb-calc-1",
            list_price_cents=2900,
            discount_cents=2900 - amount_cents,
            amount_cents=amount_cents,
            currency=currency,
            discount_code_id=discount_code_id,
            payment_provider="fake",
            paid_at=paid_at if paid_at is not None else (now if paid else None),
            access_token_hash=hash_token("token"),
        )
        if created_at is not None:
            order.created_at = created_at
        db.add(order)
        db.commit()
        return order

    return _make


@pytest.fixture
def add_job(db):
    def _add(
        order: Order | None, *, kind: str = "generate_report", status: JobStatus = JobStatus.FAILED, **fields
    ) -> Job:
        payload = {"order_id": str(order.id)} if order is not None else {}
        if kind == "generate_report" and order is not None:
            fields.setdefault("dedupe_key", f"generate_report:{order.id}")
        job = Job(
            kind=kind,
            payload=payload,
            status=status,
            attempts=fields.pop("attempts", 5),
            last_error=fields.pop("last_error", "boom"),
            finished_at=utcnow() if status in (JobStatus.FAILED, JobStatus.DONE) else None,
            **fields,
        )
        db.add(job)
        db.commit()
        return job

    return _add


@pytest.fixture
def add_report(db):
    def _add(order: Order, *, expires_in: timedelta = timedelta(hours=24), with_file: bool = True) -> Report:
        file_key = new_report_file_key()
        if with_file:
            storage.save_report(file_key, b"%PDF-1.4 test")
        report = Report(
            order_id=order.id,
            file_key=file_key,
            size_bytes=13,
            sha256="0" * 64,
            expires_at=utcnow() + expires_in,
        )
        db.add(report)
        db.commit()
        return report

    return _add


@pytest.fixture
def manager(admin_client):
    return admin_client("admin")


def error(response) -> dict:
    return response.json()["error"]


def audit_actions(db) -> list[tuple[str, str]]:
    db.expire_all()
    return [(a.action, a.entity_id) for a in db.scalars(select(AuditLog).order_by(AuditLog.id))]


def reload(db, row):
    db.expire_all()
    return db.get(type(row), row.id)


# ---------------------------------------------------------------------------
# Roles & CSRF
# ---------------------------------------------------------------------------

ENDPOINTS = [
    ("get", "/orders", None),
    ("get", "/orders/{id}", None),
    ("post", "/orders/{id}/retry-generation", None),
    ("post", "/orders/{id}/resend-email", None),
    ("post", "/orders/{id}/extend-access", {"hours": 2}),
    ("get", "/dashboard", None),
    ("get", "/jobs", None),
    ("post", "/jobs/1/retry", None),
]


@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_requires_login(client, make_order, method, path, body):
    order = make_order(OrderStatus.GENERATION_FAILED)
    response = client.request(method.upper(), ADMIN + path.format(id=order.id), json=body)
    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_editors_are_forbidden(admin_client, make_order, method, path, body):
    editor = admin_client("editor")
    order = make_order(OrderStatus.GENERATION_FAILED)

    response = editor.request(method.upper(), ADMIN + path.format(id=order.id), json=body)

    assert response.status_code == 403
    assert error(response)["code"] == "forbidden"


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_managers_can_read(admin_client, make_order, role):
    user = admin_client(role)
    order = make_order()

    assert user.get(f"{ADMIN}/orders").status_code == 200
    assert user.get(f"{ADMIN}/orders/{order.id}").status_code == 200
    assert user.get(f"{ADMIN}/dashboard").status_code == 200
    assert user.get(f"{ADMIN}/jobs").status_code == 200


def test_mutations_need_the_csrf_header(manager, db, make_order, add_job):
    order = make_order(OrderStatus.GENERATION_FAILED)
    add_job(order)
    del manager.headers["X-ZB-Admin"]

    response = manager.post(f"{ADMIN}/orders/{order.id}/retry-generation")

    assert response.status_code == 403
    assert error(response)["code"] == "csrf_failed"
    assert reload(db, order).status == OrderStatus.GENERATION_FAILED


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------


def test_list_orders_newest_first_with_discount_code(manager, db, make_order):
    code = DiscountCode(code="SAVE10", kind=DiscountKind.PERCENT, value=10)
    db.add(code)
    db.commit()
    old = make_order(created_at=utcnow() - timedelta(days=2))
    new = make_order(OrderStatus.READY, email="bob@example.com", amount_cents=2610, discount_code_id=code.id)

    response = manager.get(f"{ADMIN}/orders")

    assert response.status_code == 200
    body = response.json()
    assert (body["total"], body["page"], body["page_size"]) == (2, 1, 20)
    assert [item["id"] for item in body["items"]] == [str(new.id), str(old.id)]
    first = body["items"][0]
    assert set(first) == {
        "id",
        "status",
        "email",
        "amount_cents",
        "currency",
        "created_at",
        "paid_at",
        "ready_at",
        "locale",
        "discount_code",
    }
    assert first["discount_code"] == "SAVE10"
    assert first["status"] == "ready"
    assert first["amount_cents"] == 2610
    assert body["items"][1]["discount_code"] is None


def test_list_filters_by_status(manager, make_order):
    make_order(OrderStatus.QUEUED)
    failed = make_order(OrderStatus.GENERATION_FAILED)

    body = manager.get(f"{ADMIN}/orders", params={"status": "generation_failed"}).json()

    assert [item["id"] for item in body["items"]] == [str(failed.id)]
    assert manager.get(f"{ADMIN}/orders", params={"status": "bogus"}).status_code == 422


def test_search_by_email_substring_and_order_id(manager, make_order):
    alice = make_order(email="alice@example.com")
    bob = make_order(email="bob.smith@mail.test")

    by_email = manager.get(f"{ADMIN}/orders", params={"q": "SMITH@"}).json()
    by_id = manager.get(f"{ADMIN}/orders", params={"q": str(alice.id)}).json()
    by_prefix = manager.get(f"{ADMIN}/orders", params={"q": str(bob.id)[:8]}).json()
    wildcard = manager.get(f"{ADMIN}/orders", params={"q": "%"}).json()
    underscore = manager.get(f"{ADMIN}/orders", params={"q": "_"}).json()

    assert [i["id"] for i in by_email["items"]] == [str(bob.id)]
    assert [i["id"] for i in by_id["items"]] == [str(alice.id)]
    assert str(bob.id) in [i["id"] for i in by_prefix["items"]]
    assert wildcard["total"] == 0
    assert underscore["total"] == 0


def test_pagination(manager, make_order):
    for n in range(5):
        make_order(created_at=utcnow() - timedelta(minutes=n))

    page2 = manager.get(f"{ADMIN}/orders", params={"page": 2, "page_size": 2}).json()

    assert page2["total"] == 5
    assert (page2["page"], page2["page_size"]) == (2, 2)
    assert len(page2["items"]) == 2
    assert manager.get(f"{ADMIN}/orders", params={"page_size": 101}).status_code == 422
    assert manager.get(f"{ADMIN}/orders", params={"page": 0}).status_code == 422


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


def test_order_detail(manager, db, make_order, add_job, add_report):
    order = make_order(OrderStatus.READY)
    db.add_all(
        [
            ReportSection(
                order_id=order.id,
                slot=2,
                title="Love",
                status=SectionStatus.DONE,
                attempts=1,
                word_count=400,
                model="gemini-2.5-flash",
                content="b" * 2500,
            ),
            ReportSection(order_id=order.id, slot=1, title="Core", status=SectionStatus.DONE, content="short"),
            PaymentEvent(
                provider="fake",
                event_id="fake:1",
                event_type="fake.complete",
                order_id=order.id,
                outcome="paid",
                data={"amount_cents": 2900},
            ),
        ]
    )
    db.commit()
    add_job(order, status=JobStatus.DONE)
    add_job(order, kind="send_report_email", status=JobStatus.PENDING)
    add_job(None, kind="cleanup", status=JobStatus.DONE)
    add_report(order)

    response = manager.get(f"{ADMIN}/orders/{order.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(order.id)
    assert body["email"] == "alice@example.com"
    assert body["birth_date"] == "1990-08-17"
    assert body["birth_time"] == "14:30"
    assert body["place_label"] == "Cairo, Egypt"
    assert body["payment_provider"] == "fake"
    assert body["download_available"] is True
    assert body["progress"] == {"sections_done": 2, "sections_total": 6}
    assert body["chart"]["signs"]["sun"] == "leo"
    assert body["chart"]["signs"]["year_animal"] == "horse"
    assert body["chart"]["year_boundary"] == "lichun"
    assert body["chart"]["calc_version"] == "zb-calc-1"
    assert [s["slot"] for s in body["sections"]] == [1, 2]
    love = body["sections"][1]
    assert len(love["content"]) == 2000
    assert love["content_truncated"] is True
    assert (love["title"], love["status"], love["word_count"], love["model"]) == (
        "Love",
        "done",
        400,
        "gemini-2.5-flash",
    )
    assert body["sections"][0]["content_truncated"] is False
    assert set(body["report"]) == {
        "created_at",
        "expires_at",
        "email_sent_at",
        "download_count",
        "last_download_at",
        "deleted_at",
        "size_bytes",
    }
    assert [(e["event_id"], e["outcome"]) for e in body["payment_events"]] == [("fake:1", "paid")]
    assert sorted(j["kind"] for j in body["jobs"]) == ["generate_report", "send_report_email"]
    assert all(j["order_id"] == str(order.id) for j in body["jobs"])
    assert "payload" not in body["jobs"][0]


def test_detail_of_a_purged_order(manager, db, make_order):
    order = make_order(OrderStatus.EXPIRED)
    order.chart = {**order.chart, "input": None}
    order.birth_date = None
    order.birth_time = None
    order.personal_data_purged_at = utcnow()
    db.commit()

    body = manager.get(f"{ADMIN}/orders/{order.id}").json()

    assert body["birth_date"] is None
    assert body["birth_time"] is None
    assert body["chart"]["signs"]["moon"] == "cancer"
    assert body["personal_data_purged_at"] is not None
    assert body["report"] is None


@pytest.mark.parametrize("order_id", [str(uuid.uuid4()), "nope", "123"])
def test_detail_unknown_order_is_404(manager, order_id):
    response = manager.get(f"{ADMIN}/orders/{order_id}")
    assert response.status_code == 404
    assert error(response)["code"] == "not_found"


# ---------------------------------------------------------------------------
# Retry generation
# ---------------------------------------------------------------------------


def test_retry_resets_the_existing_job(manager, db, make_order, add_job):
    order = make_order(OrderStatus.GENERATION_FAILED)
    order.last_error = "ai_error: blocked"
    db.commit()
    job = add_job(order, run_at=utcnow() + timedelta(days=1), locked_by="w1")

    response = manager.post(f"{ADMIN}/orders/{order.id}/retry-generation")

    assert response.status_code == 200
    assert response.json() == {"order_id": str(order.id), "status": "queued", "job_id": job.id}
    job = reload(db, job)
    assert (job.status, job.attempts, job.last_error, job.finished_at, job.locked_by) == (
        JobStatus.PENDING,
        0,
        None,
        None,
        None,
    )
    assert job.run_at <= utcnow()
    assert job.dedupe_key == f"generate_report:{order.id}"
    assert len(db.scalars(select(Job)).all()) == 1
    order = reload(db, order)
    assert order.status == OrderStatus.QUEUED
    assert order.last_error is None
    assert audit_actions(db) == [("order.retry_generation", str(order.id))]
    entry = db.scalar(select(AuditLog))
    assert entry.data == {"previous_status": "generation_failed", "job_id": job.id}


def test_retry_enqueues_a_job_when_none_exists(manager, db, make_order):
    order = make_order(OrderStatus.GENERATION_FAILED)

    response = manager.post(f"{ADMIN}/orders/{order.id}/retry-generation")

    assert response.status_code == 200
    [job] = db.scalars(select(Job)).all()
    assert job.id == response.json()["job_id"]
    assert (job.kind, job.status, job.dedupe_key, job.payload) == (
        "generate_report",
        JobStatus.PENDING,
        f"generate_report:{order.id}",
        {"order_id": str(order.id)},
    )


@pytest.mark.parametrize("status", [OrderStatus.QUEUED, OrderStatus.GENERATING, OrderStatus.PAID])
def test_retry_of_a_stuck_order(manager, db, make_order, add_job, status):
    order = make_order(status)
    add_job(order, status=JobStatus.FAILED)

    response = manager.post(f"{ADMIN}/orders/{order.id}/retry-generation")

    assert response.status_code == 200
    assert reload(db, order).status == OrderStatus.QUEUED


@pytest.mark.parametrize("job_status", [JobStatus.PENDING, JobStatus.RUNNING])
def test_no_retry_while_a_job_is_active(manager, db, make_order, add_job, job_status):
    order = make_order(OrderStatus.GENERATING)
    job = add_job(order, status=job_status, attempts=1)

    response = manager.post(f"{ADMIN}/orders/{order.id}/retry-generation")

    assert response.status_code == 409
    assert error(response)["code"] == "generation_in_progress"
    assert reload(db, job).attempts == 1
    assert audit_actions(db) == []


@pytest.mark.parametrize(
    "status",
    [OrderStatus.AWAITING_PAYMENT, OrderStatus.READY, OrderStatus.REFUNDED, OrderStatus.EXPIRED, OrderStatus.ABANDONED],
)
def test_retry_refused_for_other_statuses(manager, db, make_order, status):
    order = make_order(status)

    response = manager.post(f"{ADMIN}/orders/{order.id}/retry-generation")

    assert response.status_code == 409
    assert error(response)["code"] == "order_not_retryable"
    assert db.scalars(select(Job)).all() == []


def test_retry_unknown_order(manager):
    assert manager.post(f"{ADMIN}/orders/{uuid.uuid4()}/retry-generation").status_code == 404


# ---------------------------------------------------------------------------
# Resend e-mail
# ---------------------------------------------------------------------------


def test_resend_email_queues_a_new_job_each_time(manager, db, make_order, add_report):
    order = make_order(OrderStatus.READY)
    add_report(order)

    first = manager.post(f"{ADMIN}/orders/{order.id}/resend-email")
    second = manager.post(f"{ADMIN}/orders/{order.id}/resend-email")

    assert first.status_code == second.status_code == 200
    assert first.json()["order_id"] == str(order.id)
    jobs = db.scalars(select(Job).order_by(Job.id)).all()
    assert [(j.kind, j.dedupe_key, j.payload) for j in jobs] == [
        ("send_report_email", None, {"order_id": str(order.id)}),
        ("send_report_email", None, {"order_id": str(order.id)}),
    ]
    assert [j.id for j in jobs] == [first.json()["job_id"], second.json()["job_id"]]
    assert audit_actions(db) == [("order.resend_email", str(order.id))] * 2


@pytest.mark.parametrize(
    ("status", "report_kwargs"),
    [
        (OrderStatus.QUEUED, None),
        (OrderStatus.READY, None),  # no report row
        (OrderStatus.READY, {"expires_in": timedelta(minutes=-1)}),
        (OrderStatus.READY, {"with_file": False}),
        (OrderStatus.EXPIRED, {"expires_in": timedelta(hours=-1)}),
        (OrderStatus.REFUNDED, {}),
    ],
)
def test_resend_needs_an_available_report(manager, db, make_order, add_report, status, report_kwargs):
    order = make_order(status)
    if report_kwargs is not None:
        add_report(order, **report_kwargs)

    response = manager.post(f"{ADMIN}/orders/{order.id}/resend-email")

    assert response.status_code == 409
    assert error(response)["code"] == "report_not_available"
    assert db.scalars(select(Job)).all() == []


def test_resend_with_deleted_report(manager, db, make_order, add_report):
    order = make_order(OrderStatus.READY)
    report = add_report(order)
    report.deleted_at = utcnow()
    db.commit()

    assert manager.post(f"{ADMIN}/orders/{order.id}/resend-email").status_code == 409


# ---------------------------------------------------------------------------
# Extend access
# ---------------------------------------------------------------------------


def test_extend_access_adds_hours_to_the_current_window(manager, db, make_order, add_report):
    order = make_order(OrderStatus.READY)
    report = add_report(order, expires_in=timedelta(hours=3))
    before = report.expires_at

    response = manager.post(f"{ADMIN}/orders/{order.id}/extend-access", json={"hours": 24})

    assert response.status_code == 200
    report = reload(db, report)
    assert report.expires_at == before + timedelta(hours=24)
    assert datetime.fromisoformat(response.json()["expires_at"]) == report.expires_at
    assert audit_actions(db) == [("order.extend_access", str(order.id))]
    assert db.scalar(select(AuditLog)).data["hours"] == 24


def test_extend_lapsed_access_counts_from_now(manager, db, make_order, add_report):
    order = make_order(OrderStatus.READY)
    report = add_report(order, expires_in=timedelta(hours=-5))

    manager.post(f"{ADMIN}/orders/{order.id}/extend-access", json={"hours": 2})

    expires_at = reload(db, report).expires_at
    assert utcnow() + timedelta(hours=1, minutes=59) < expires_at <= utcnow() + timedelta(hours=2)


@pytest.mark.parametrize("hours", [0, 169, -1, 1.5, "2", None])
def test_extend_hours_must_be_1_to_168(manager, make_order, add_report, hours):
    order = make_order(OrderStatus.READY)
    add_report(order)

    response = manager.post(f"{ADMIN}/orders/{order.id}/extend-access", json={"hours": hours})

    assert response.status_code == 422
    assert error(response)["code"] == "validation_error"


def test_extend_limits_are_inclusive(manager, make_order, add_report):
    order = make_order(OrderStatus.READY)
    add_report(order)

    assert manager.post(f"{ADMIN}/orders/{order.id}/extend-access", json={"hours": 1}).status_code == 200
    assert manager.post(f"{ADMIN}/orders/{order.id}/extend-access", json={"hours": 168}).status_code == 200


@pytest.mark.parametrize(
    ("status", "with_file"),
    [(OrderStatus.READY, False), (OrderStatus.EXPIRED, True), (OrderStatus.REFUNDED, True), (OrderStatus.QUEUED, None)],
)
def test_extend_needs_a_ready_order_with_its_file(manager, db, make_order, add_report, status, with_file):
    order = make_order(status)
    report = add_report(order, with_file=with_file) if with_file is not None else None

    response = manager.post(f"{ADMIN}/orders/{order.id}/extend-access", json={"hours": 5})

    assert response.status_code == 409
    assert error(response)["code"] == "report_not_available"
    if report is not None:
        assert reload(db, report).expires_at == report.expires_at


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


def test_dashboard(manager, db, make_order, add_job):
    now = utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    make_order(OrderStatus.READY, paid_at=now, amount_cents=2900)
    make_order(OrderStatus.QUEUED, paid_at=now, amount_cents=0)
    make_order(OrderStatus.READY, paid_at=today_start - timedelta(days=3), amount_cents=2610)
    make_order(OrderStatus.EXPIRED, paid_at=now - timedelta(days=20), amount_cents=2900)
    make_order(OrderStatus.READY, paid_at=now - timedelta(days=40), amount_cents=2900)
    make_order(OrderStatus.REFUNDED, paid_at=now, amount_cents=2900)
    make_order(OrderStatus.READY, paid_at=now, amount_cents=4000, currency="EUR")
    make_order(OrderStatus.AWAITING_PAYMENT)
    db.add_all(
        [
            FreeReadingRequest(email="a@x.com", locale="en", sun_sign="leo", year_animal="horse"),
            FreeReadingRequest(
                email="b@x.com", locale="en", sun_sign="leo", year_animal="horse", created_at=now - timedelta(days=10)
            ),
        ]
    )
    db.commit()
    add_job(None, kind="cleanup", status=JobStatus.FAILED)
    add_job(None, kind="cleanup", status=JobStatus.DONE)

    response = manager.get(f"{ADMIN}/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["orders"] == {"today": 3, "last_7_days": 4, "last_30_days": 5}
    assert body["revenue_cents"] == {"today": 2900, "last_7_days": 5510, "last_30_days": 8410}
    assert body["currency"] == "USD"
    assert body["status_counts"]["ready"] == 4
    assert body["status_counts"]["refunded"] == 1
    assert body["status_counts"]["awaiting_payment"] == 1
    assert body["status_counts"]["generating"] == 0
    assert set(body["status_counts"]) == {s.value for s in OrderStatus}
    assert body["free_readings"] == {"today": 1, "last_7_days": 1, "last_30_days": 2}
    assert body["failed_jobs"] == 1
    assert len(body["recent_orders"]) == 5


def test_dashboard_revenue_follows_the_configured_currency(manager, db, make_order):
    settings_store.set_settings(db, {"currency": "EUR"})
    db.commit()
    make_order(OrderStatus.READY, amount_cents=4000, currency="EUR")
    make_order(OrderStatus.READY, amount_cents=2900, currency="USD")

    body = manager.get(f"{ADMIN}/dashboard").json()

    assert body["currency"] == "EUR"
    assert body["revenue_cents"]["today"] == 4000
    assert body["orders"]["today"] == 2


def test_empty_dashboard(manager):
    body = manager.get(f"{ADMIN}/dashboard").json()
    assert body["orders"] == {"today": 0, "last_7_days": 0, "last_30_days": 0}
    assert body["revenue_cents"] == {"today": 0, "last_7_days": 0, "last_30_days": 0}
    assert body["recent_orders"] == []
    assert body["failed_jobs"] == 0


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


def test_jobs_list_defaults_to_failed(manager, make_order, add_job):
    order = make_order(OrderStatus.GENERATION_FAILED)
    failed = add_job(order)
    add_job(None, kind="cleanup", status=JobStatus.DONE)
    pending = add_job(None, kind="send_report_email", status=JobStatus.PENDING)

    body = manager.get(f"{ADMIN}/jobs").json()
    pending_body = manager.get(f"{ADMIN}/jobs", params={"status": "pending"}).json()

    assert [j["id"] for j in body["items"]] == [failed.id]
    assert body["total"] == 1
    item = body["items"][0]
    assert (item["kind"], item["status"], item["order_id"], item["last_error"]) == (
        "generate_report",
        "failed",
        str(order.id),
        "boom",
    )
    assert [j["id"] for j in pending_body["items"]] == [pending.id]
    assert manager.get(f"{ADMIN}/jobs", params={"status": "bogus"}).status_code == 422


def test_jobs_never_expose_payload_secrets(manager, make_order, add_job, db):
    order = make_order(OrderStatus.READY)
    job = add_job(order, kind="send_report_email")
    job.payload = {"order_id": str(order.id), "email_token": "secret-token"}
    db.commit()

    response = manager.get(f"{ADMIN}/jobs")
    detail = manager.get(f"{ADMIN}/orders/{order.id}")

    assert "secret-token" not in response.text
    assert "secret-token" not in detail.text


def test_jobs_pagination(manager, add_job):
    for _ in range(3):
        add_job(None, kind="cleanup")

    body = manager.get(f"{ADMIN}/jobs", params={"page": 2, "page_size": 2}).json()

    assert body["total"] == 3
    assert len(body["items"]) == 1


def test_retry_failed_job(manager, db, add_job):
    job = add_job(None, kind="cleanup", run_at=utcnow() + timedelta(days=1))

    response = manager.post(f"{ADMIN}/jobs/{job.id}/retry")

    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    job = reload(db, job)
    assert (job.status, job.attempts, job.last_error, job.finished_at) == (JobStatus.PENDING, 0, None, None)
    assert job.run_at <= utcnow()
    assert audit_actions(db) == [("job.retry", str(job.id))]


def test_retry_generate_job_requeues_the_failed_order(manager, db, make_order, add_job):
    order = make_order(OrderStatus.GENERATION_FAILED)
    job = add_job(order)

    manager.post(f"{ADMIN}/jobs/{job.id}/retry")

    assert reload(db, order).status == OrderStatus.QUEUED


@pytest.mark.parametrize("status", [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.DONE])
def test_only_failed_jobs_can_be_retried(manager, add_job, status):
    job = add_job(None, kind="cleanup", status=status)

    response = manager.post(f"{ADMIN}/jobs/{job.id}/retry")

    assert response.status_code == 409
    assert error(response)["code"] == "job_not_failed"


def test_retry_unknown_job(manager):
    assert manager.post(f"{ADMIN}/jobs/999999/retry").status_code == 404
    assert manager.post(f"{ADMIN}/jobs/abc/retry").status_code == 422


def test_end_to_end_free_order_appears_in_admin(manager, client, db, sample_geo):
    db.add(DiscountCode(code="FREE", kind=DiscountKind.PERCENT, value=100))
    db.commit()
    created = client.post(
        "/api/v1/orders",
        json={
            "email": "zoe@example.com",
            "birth_date": "1990-08-17",
            "birth_time": "14:30",
            "city_id": 360630,
            "discount_code": "FREE",
            "accept_terms": True,
        },
    ).json()

    body = manager.get(f"{ADMIN}/orders/{created['order_id']}").json()

    assert body["status"] == "queued"
    assert body["discount_code"] == "FREE"
    assert body["payment_provider"] == "free"
    assert [e["outcome"] for e in body["payment_events"]] == ["paid"]
    assert [j["kind"] for j in body["jobs"]] == ["generate_report"]
    assert get_settings().site_url in created["checkout_url"]
    assert datetime.fromisoformat(body["created_at"]).tzinfo is not None
    assert body["paid_at"] is not None
