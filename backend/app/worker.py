"""Job worker process: ``python -m app.worker`` (or ``python -m app.cli worker``).

Runs ``settings.worker_concurrency`` threads that claim jobs from the PostgreSQL queue
(``FOR UPDATE SKIP LOCKED``) plus a scheduler thread that enqueues the periodic cleanup job.
Several worker processes may run side by side: claiming is atomic and the cleanup job is
deduplicated per 10-minute bucket. SIGINT/SIGTERM stop claiming new jobs; running jobs get a
grace period to finish, after which an unfinished job is recovered when its lease expires.
"""

from __future__ import annotations

import logging
import os
import signal
import socket
import threading
import time
from datetime import datetime
from types import FrameType

from sqlalchemy.exc import StatementError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import queue, registry
from app.models import Job, JobStatus
from app.utils import utcnow

log = logging.getLogger("zb.worker")

CLEANUP_INTERVAL_MINUTES = 10
SHUTDOWN_GRACE_SECONDS = 30.0
_MAX_IDLE_BACKOFF_SECONDS = 30.0
_WORKER_ID_MAX_LENGTH = 100  # jobs.locked_by column size


def run_once(worker_id: str) -> bool:
    """Claim and process at most one due job. Returns ``True`` if a job was processed."""
    settings = get_settings()
    db = SessionLocal()
    try:
        job = queue.claim_next(db, worker_id, settings.job_lease_seconds)
        db.commit()
        if job is None:
            return False
        _process(db, job)
        return True
    finally:
        db.close()


def _process(db: Session, job: Job) -> None:
    job_id, kind = job.id, job.kind
    log.info("job %s (%s) started, attempt %s/%s", job_id, kind, job.attempts, job.max_attempts)
    try:
        handler = registry.get_handler(kind)
        handler(db, job)
        queue.mark_done(job)
        db.commit()
    except registry.PermanentJobError as exc:
        log.error("job %s (%s) failed permanently: %s", job_id, kind, exc)
        _record_failure(db, job_id, str(exc), retryable=False)
        return
    except Exception as exc:
        _log_exception(job_id, kind, exc)
        _record_failure(db, job_id, safe_error_text(exc), retryable=True)
        return
    log.info("job %s (%s) done", job_id, kind)


def _record_failure(db: Session, job_id: int, error: str, *, retryable: bool) -> None:
    """Discard the handler's uncommitted work, then record the failed attempt on a fresh copy of the job."""
    db.rollback()
    job = db.get(Job, job_id, populate_existing=True)
    if job is None:
        return
    queue.mark_failed_attempt(job, error, retryable=retryable)
    db.commit()
    if job.status == JobStatus.PENDING:
        log.info("job %s retry scheduled at %s", job_id, job.run_at.isoformat())


def safe_error_text(exc: BaseException) -> str:
    """Error text for ``jobs.last_error`` (visible in the dashboard).

    Database errors may quote the bound parameters or the offending value (personal data, tokens),
    both in SQLAlchemy's message and in PostgreSQL's own text, so for them only the error classes,
    the SQLSTATE and schema identifiers are kept.
    """
    if isinstance(exc, StatementError):
        orig = exc.orig
        parts = [type(orig).__name__ if orig is not None else "unknown"]
        sqlstate = getattr(orig, "sqlstate", None)
        if sqlstate:
            parts.append(f"sqlstate={sqlstate}")
        diag = getattr(orig, "diag", None)
        for field in ("table_name", "column_name", "constraint_name"):
            value = getattr(diag, field, None) if diag is not None else None
            if value:
                parts.append(f"{field}={value}")
        return f"{type(exc).__name__}({', '.join(parts)})"[:4000]
    return repr(exc)[:4000]


def _log_exception(job_id: int, kind: str, exc: BaseException) -> None:
    if isinstance(exc, StatementError):
        log.error("job %s (%s) failed: %s", job_id, kind, safe_error_text(exc))
    else:
        log.error("job %s (%s) failed", job_id, kind, exc_info=exc)


# ---------------------------------------------------------------------------
# Periodic cleanup
# ---------------------------------------------------------------------------


def cleanup_dedupe_key(now: datetime) -> str:
    epoch_minutes = int(now.timestamp() // 60)
    return f"cleanup:{epoch_minutes // CLEANUP_INTERVAL_MINUTES}"


def schedule_cleanup(now: datetime | None = None) -> int | None:
    """Enqueue the cleanup job for the current 10-minute bucket (no-op if already enqueued)."""
    db = SessionLocal()
    try:
        job_id = queue.enqueue(db, queue.CLEANUP, {}, dedupe_key=cleanup_dedupe_key(now or utcnow()))
        db.commit()
        return job_id
    finally:
        db.close()


def _scheduler_loop(stop: threading.Event) -> None:
    last_key: str | None = None
    while not stop.is_set():
        key = cleanup_dedupe_key(utcnow())
        if key != last_key:
            try:
                schedule_cleanup()
                last_key = key
            except Exception:
                log.exception("could not enqueue the cleanup job")
        stop.wait(30.0)


# ---------------------------------------------------------------------------
# Worker threads
# ---------------------------------------------------------------------------


def _worker_loop(worker_id: str, stop: threading.Event, poll_seconds: float) -> None:
    failures = 0
    while not stop.is_set():
        try:
            processed = run_once(worker_id)
            failures = 0
        except Exception:  # e.g. database unavailable: back off and keep the thread alive
            failures += 1
            log.exception("worker %s loop error", worker_id)
            stop.wait(min(_MAX_IDLE_BACKOFF_SECONDS, poll_seconds * 2**failures))
            continue
        if not processed:
            stop.wait(poll_seconds)


def worker_id_for(index: int) -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{index}"[-_WORKER_ID_MAX_LENGTH:]


def serve(stop: threading.Event, *, concurrency: int | None = None, with_scheduler: bool = True) -> None:
    """Run worker threads (and the cleanup scheduler) until ``stop`` is set, then wait for them."""
    settings = get_settings()
    count = max(1, concurrency if concurrency is not None else settings.worker_concurrency)
    threads = [
        threading.Thread(
            target=_worker_loop,
            args=(worker_id_for(i), stop, settings.worker_poll_seconds),
            name=f"zb-worker-{i}",
            daemon=True,
        )
        for i in range(count)
    ]
    if with_scheduler:
        threads.append(threading.Thread(target=_scheduler_loop, args=(stop,), name="zb-scheduler", daemon=True))
    for thread in threads:
        thread.start()
    log.info("worker started with %s threads", count)
    while not stop.wait(1.0):  # short waits keep the main thread responsive to signals
        pass
    log.info("worker stopping; waiting up to %.0fs for running jobs", SHUTDOWN_GRACE_SECONDS)
    deadline = time.monotonic() + SHUTDOWN_GRACE_SECONDS
    for thread in threads:
        thread.join(timeout=max(0.0, deadline - time.monotonic()))
    unfinished = [t.name for t in threads if t.is_alive()]
    if unfinished:
        log.warning("exiting with unfinished threads %s; their jobs resume after the lease expires", unfinished)


def _install_signal_handlers(stop: threading.Event) -> None:
    def _handle(signum: int, _frame: FrameType | None) -> None:
        log.info("received %s", signal.Signals(signum).name)
        stop.set()

    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)


def main() -> int:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(threadName)s: %(message)s")
    stop = threading.Event()
    _install_signal_handlers(stop)
    serve(stop)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
