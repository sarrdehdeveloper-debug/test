"""Tests for the job worker (app.worker)."""

from __future__ import annotations

import signal
import threading
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import worker
from app.charts.schemas import Chart
from app.generation import ai, jobs
from app.generation.ai import AITransientError, FakeAIClient
from app.jobs import queue, registry
from app.jobs.registry import PermanentJobError
from app.models import Job, JobStatus, Order, OrderStatus, PromptStatus, PromptVersion, ReportSection, Setting
from app.security import hash_token
from app.utils import utcnow

TEST_KIND = "test_kind"


# Self-contained builders (tests/test_generation.py has the richer versions).
_PILLAR = {"stem_pinyin": "x", "branch_pinyin": "x", "polarity": "yang"}
_CHART = Chart.model_validate(
    {
        "input": {
            "local_datetime": "1985-03-02T06:15:00+00:00",
            "utc_datetime": "1985-03-02T06:15:00+00:00",
            "timezone": "Europe/London",
            "utc_offset_minutes": 0,
            "is_dst": False,
            "latitude": 51.50853,
            "longitude": -0.12574,
            "place_label": "London, United Kingdom",
        },
        "western": {
            "sun": {"sign": "pisces", "longitude": 341.6, "degree_in_sign": 11.6},
            "moon": {"sign": "cancer", "longitude": 105.2, "degree_in_sign": 15.2},
            "ascendant": {"sign": "pisces", "longitude": 350.4, "degree_in_sign": 20.4},
            "sun_on_cusp": False,
        },
        "chinese": {
            "year_boundary": "lichun",
            "day_boundary": "midnight",
            "year": {**_PILLAR, "stem": "乙", "branch": "丑", "animal": "ox", "element": "wood", "polarity": "yin"},
            "month": {**_PILLAR, "stem": "戊", "branch": "寅", "animal": "tiger", "element": "earth"},
            "day": {**_PILLAR, "stem": "丙", "branch": "午", "animal": "horse", "element": "fire"},
            "hour": {
                **_PILLAR,
                "stem": "辛",
                "branch": "卯",
                "animal": "rabbit",
                "element": "metal",
                "polarity": "yin",
            },
        },
    }
).model_dump(mode="json")


def publish_all(db: Session, slots: tuple[int, ...] = (1, 2, 3, 4, 5, 6)) -> None:
    for slot in slots:
        db.add(
            PromptVersion(
                slot=slot,
                version=1,
                name=f"Prompt {slot}",
                section_titles={"en": f"Section {slot}"},
                template=f"SLOT-{slot}: Write in {{{{ language }}}} about the {{{{ sun_sign }}}} Sun.",
                status=PromptStatus.PUBLISHED,
                published_at=utcnow(),
            )
        )
    db.commit()


def make_order(db: Session) -> Order:
    order = Order(
        status=OrderStatus.QUEUED,
        email="buyer@example.com",
        locale="en",
        chart=_CHART,
        calc_version="zb-calc-1",
        list_price_cents=2900,
        amount_cents=2900,
        currency="USD",
        payment_provider="fake",
        paid_at=utcnow(),
        access_token_hash=hash_token("token"),
    )
    db.add(order)
    db.commit()
    return order


@pytest.fixture
def handlers(monkeypatch):
    """Register test handlers: ``handlers[kind] = fn``; other kinds use the real registry."""
    table: dict[str, Any] = {}
    real_get_handler = registry.get_handler

    def _get_handler(kind: str):
        return table[kind] if kind in table else real_get_handler(kind)

    monkeypatch.setattr(registry, "get_handler", _get_handler)
    return table


def add_job(db: Session, kind: str = TEST_KIND, payload: dict[str, Any] | None = None, **kwargs: Any) -> int:
    job_id = queue.enqueue(db, kind, payload or {}, **kwargs)
    db.commit()
    assert job_id is not None
    return job_id


def load_job(db: Session, job_id: int) -> Job:
    db.expire_all()
    job = db.get(Job, job_id)
    assert job is not None
    return job


def test_run_once_without_jobs_returns_false():
    assert worker.run_once("w-1") is False


def test_run_once_processes_job_and_marks_done(db, handlers):
    seen: list[tuple[int, dict[str, Any], str | None]] = []
    handlers[TEST_KIND] = lambda db_, job: seen.append((job.id, job.payload, job.locked_by))
    job_id = add_job(db, payload={"x": 1})

    assert worker.run_once("w-1") is True

    assert seen == [(job_id, {"x": 1}, "w-1")]
    job = load_job(db, job_id)
    assert job.status == JobStatus.DONE
    assert job.attempts == 1
    assert job.finished_at is not None
    assert job.locked_by is None and job.locked_until is None
    assert worker.run_once("w-1") is False


def test_jobs_are_processed_in_run_at_order(db, handlers):
    order: list[str] = []
    handlers[TEST_KIND] = lambda db_, job: order.append(job.payload["name"])
    add_job(db, payload={"name": "later"}, run_at=utcnow() - timedelta(seconds=1))
    add_job(db, payload={"name": "earlier"}, run_at=utcnow() - timedelta(seconds=10))
    add_job(db, payload={"name": "future"}, run_at=utcnow() + timedelta(hours=1))

    while worker.run_once("w-1"):
        pass
    assert order == ["earlier", "later"]


def test_handler_commits_are_kept_and_uncommitted_work_is_rolled_back(db, handlers):
    def handler(db_: Session, job: Job) -> None:
        db_.add(Setting(key="committed", value=1))
        db_.commit()
        db_.add(Setting(key="uncommitted", value=2))
        db_.flush()
        raise RuntimeError("boom")

    handlers[TEST_KIND] = handler
    job_id = add_job(db)
    worker.run_once("w-1")

    db.expire_all()
    assert {s.key for s in db.scalars(select(Setting))} == {"committed"}
    assert load_job(db, job_id).status == JobStatus.PENDING


def test_permanent_error_fails_job_without_retry(db, handlers):
    def handler(db_: Session, job: Job) -> None:
        raise PermanentJobError("order_not_found")

    handlers[TEST_KIND] = handler
    job_id = add_job(db)

    assert worker.run_once("w-1") is True

    job = load_job(db, job_id)
    assert job.status == JobStatus.FAILED
    assert job.attempts == 1
    assert job.last_error == "order_not_found"
    assert job.finished_at is not None
    assert job.locked_by is None


def test_other_errors_are_retried_with_backoff(db, handlers):
    def handler(db_: Session, job: Job) -> None:
        raise ConnectionError("upstream down")

    handlers[TEST_KIND] = handler
    job_id = add_job(db)
    before = utcnow()

    worker.run_once("w-1")

    job = load_job(db, job_id)
    assert job.status == JobStatus.PENDING
    assert job.attempts == 1
    assert job.last_error == "ConnectionError('upstream down')"
    assert job.run_at > before + timedelta(seconds=3)  # 5 s base backoff with +-25 % jitter
    assert job.locked_by is None
    assert worker.run_once("w-1") is False  # not due yet

    # Due again: second attempt has a longer backoff.
    job.run_at = utcnow() - timedelta(seconds=1)
    db.commit()
    worker.run_once("w-1")
    job = load_job(db, job_id)
    assert job.attempts == 2
    assert job.run_at > utcnow() + timedelta(seconds=7)


def test_retryable_error_fails_after_max_attempts(db, handlers):
    def handler(db_: Session, job: Job) -> None:
        raise RuntimeError("still broken")

    handlers[TEST_KIND] = handler
    job_id = add_job(db, max_attempts=2)
    for _ in range(2):
        job = load_job(db, job_id)
        job.run_at = utcnow() - timedelta(seconds=1)
        db.commit()
        worker.run_once("w-1")

    job = load_job(db, job_id)
    assert job.status == JobStatus.FAILED
    assert job.attempts == 2


def test_unknown_job_kind_fails_permanently(db):
    job_id = add_job(db, kind="no_such_kind")
    worker.run_once("w-1")
    job = load_job(db, job_id)
    assert job.status == JobStatus.FAILED
    assert "No handler" in job.last_error


def test_expired_lease_is_reclaimed(db, handlers):
    handlers[TEST_KIND] = lambda db_, job: None
    job_id = add_job(db)
    job = queue.claim_next(db, "crashed-worker", 60)
    job.locked_until = utcnow() - timedelta(seconds=1)  # the worker died mid-job
    db.commit()

    assert worker.run_once("w-2") is True
    job = load_job(db, job_id)
    assert job.status == JobStatus.DONE
    assert job.attempts == 2


def test_safe_error_text_hides_sql_parameters(db):
    secret = "1990-08-17 birth secret"
    with pytest.raises(Exception) as info:
        db.execute(text("SELECT CAST(:value AS integer)"), {"value": secret})
    db.rollback()
    message = worker.safe_error_text(info.value)
    assert secret not in message
    assert "DataError" in message or "InvalidTextRepresentation" in message
    assert worker.safe_error_text(ValueError("plain")) == "ValueError('plain')"


def test_database_errors_in_handlers_do_not_leak_parameters(db, handlers):
    secret = "secret-token-value"

    def handler(db_: Session, job: Job) -> None:
        db_.execute(text("SELECT CAST(:value AS integer)"), {"value": secret})

    handlers[TEST_KIND] = handler
    job_id = add_job(db)
    worker.run_once("w-1")
    job = load_job(db, job_id)
    assert job.status == JobStatus.PENDING
    assert secret not in job.last_error


# ---------------------------------------------------------------------------
# Generate report jobs through the worker
# ---------------------------------------------------------------------------


@pytest.fixture
def generation_env(monkeypatch):
    sleeps: list[float] = []
    built: list[Any] = []
    monkeypatch.setattr(jobs, "_sleep", sleeps.append)

    def _fake_build(db_: Session, order: Order) -> None:
        built.append(order.id)
        order.status = OrderStatus.READY

    monkeypatch.setattr(jobs, "_build_report", _fake_build)

    def _use(client: FakeAIClient) -> FakeAIClient:
        monkeypatch.setattr(ai, "get_ai_client", lambda: client)
        return client

    return {"sleeps": sleeps, "built": built, "use": _use}


def _enqueue_generation(db: Session, order: Order) -> int:
    return add_job(db, queue.GENERATE_REPORT, {"order_id": str(order.id)}, dedupe_key=f"generate_report:{order.id}")


def _sections(db: Session, order: Order) -> int:
    db.expire_all()
    return len(db.scalars(select(ReportSection).where(ReportSection.order_id == order.id)).all())


def test_worker_runs_generate_report_end_to_end(db, generation_env):
    publish_all(db)
    order = make_order(db)
    generation_env["use"](FakeAIClient())
    job_id = _enqueue_generation(db, order)

    assert worker.run_once("w-1") is True

    assert load_job(db, job_id).status == JobStatus.DONE
    assert _sections(db, order) == 6
    assert db.get(Order, order.id).status == OrderStatus.READY
    assert generation_env["built"] == [order.id]
    assert len(generation_env["sleeps"]) == 5


def test_worker_retries_generation_after_transient_ai_error(db, generation_env):
    publish_all(db)
    order = make_order(db)
    generation_env["use"](FakeAIClient([300, 300, AITransientError("Gemini API error 429: quota")]))
    job_id = _enqueue_generation(db, order)

    worker.run_once("w-1")

    job = load_job(db, job_id)
    assert job.status == JobStatus.PENDING
    assert job.attempts == 1
    assert job.run_at > utcnow()
    assert "429" in job.last_error
    assert _sections(db, order) == 2
    assert db.get(Order, order.id).status == OrderStatus.GENERATING

    job.run_at = utcnow() - timedelta(seconds=1)
    db.commit()
    retry_client = generation_env["use"](FakeAIClient())
    worker.run_once("w-1")

    assert load_job(db, job_id).status == JobStatus.DONE
    assert len(retry_client.calls) == 4
    assert _sections(db, order) == 6


def test_worker_marks_permanent_generation_failure(db, generation_env):
    publish_all(db, slots=(1, 2, 3))
    order = make_order(db)
    generation_env["use"](FakeAIClient())
    job_id = _enqueue_generation(db, order)

    worker.run_once("w-1")

    job = load_job(db, job_id)
    assert job.status == JobStatus.FAILED
    assert job.last_error == "prompts_not_configured"
    order = db.get(Order, order.id)
    assert order.status == OrderStatus.GENERATION_FAILED
    assert order.last_error == "prompts_not_configured"


# ---------------------------------------------------------------------------
# Cleanup scheduling, threads and shutdown
# ---------------------------------------------------------------------------


def test_cleanup_dedupe_key_uses_ten_minute_buckets():
    t = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
    bucket = int(t.timestamp() // 60) // 10
    assert worker.cleanup_dedupe_key(t) == f"cleanup:{bucket}"
    assert worker.cleanup_dedupe_key(t + timedelta(minutes=9, seconds=59)) == f"cleanup:{bucket}"
    assert worker.cleanup_dedupe_key(t + timedelta(minutes=10)) == f"cleanup:{bucket + 1}"


def test_schedule_cleanup_enqueues_once_per_bucket(db):
    t = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
    first = worker.schedule_cleanup(t)
    assert first is not None
    assert worker.schedule_cleanup(t + timedelta(minutes=5)) is None
    assert worker.schedule_cleanup(t + timedelta(minutes=10)) is not None
    rows = db.scalars(select(Job).where(Job.kind == queue.CLEANUP)).all()
    assert len(rows) == 2
    assert all(r.payload == {} for r in rows)


def test_serve_processes_jobs_in_threads_and_stops(db, handlers, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "worker_poll_seconds", 0.05)
    processed: list[str] = []
    lock = threading.Lock()

    def handler(db_: Session, job: Job) -> None:
        with lock:
            processed.append(threading.current_thread().name)

    handlers[TEST_KIND] = handler
    handlers[queue.CLEANUP] = handler
    job_ids = [add_job(db) for _ in range(6)]

    stop = threading.Event()
    runner = threading.Thread(target=worker.serve, args=(stop,), kwargs={"concurrency": 3}, daemon=True)
    runner.start()
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        db.expire_all()
        statuses = db.scalars(select(Job.status)).all()
        if len(statuses) == 7 and all(s == JobStatus.DONE for s in statuses):
            break
        time.sleep(0.05)
    stop.set()
    runner.join(timeout=10)

    assert not runner.is_alive()
    assert all(load_job(db, job_id).status == JobStatus.DONE for job_id in job_ids)
    cleanup = db.scalars(select(Job).where(Job.kind == queue.CLEANUP)).all()
    assert len(cleanup) == 1 and cleanup[0].status == JobStatus.DONE  # scheduler enqueued it at start
    assert len(processed) == 7
    assert {name for name in processed} <= {"zb-worker-0", "zb-worker-1", "zb-worker-2"}


def test_worker_loop_survives_database_errors(monkeypatch):
    stop = threading.Event()
    calls: list[int] = []

    def flaky_run_once(worker_id: str) -> bool:
        calls.append(1)
        if len(calls) == 1:
            raise ConnectionError("database unavailable")
        stop.set()
        return False

    monkeypatch.setattr(worker, "run_once", flaky_run_once)
    worker._worker_loop("w-1", stop, poll_seconds=0.01)
    assert len(calls) == 2


def test_signal_handlers_request_graceful_stop():
    previous = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        for sig in (signal.SIGTERM, signal.SIGINT):
            stop = threading.Event()
            worker._install_signal_handlers(stop)
            signal.raise_signal(sig)
            assert stop.is_set()
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def test_worker_id_is_unique_per_thread_and_fits_column():
    ids = {worker.worker_id_for(i) for i in range(4)}
    assert len(ids) == 4
    assert all(len(i) <= 100 for i in ids)
