"""Durable PostgreSQL job queue: enqueue (transactional outbox) and claim/complete primitives.

``enqueue`` only adds the row to the caller's session, so the job is committed atomically
with the state change that requires it (e.g. "order paid" + "generate report").
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Job, JobStatus
from app.utils import utcnow

# Job kinds (handlers are registered in app.jobs.registry)
GENERATE_REPORT = "generate_report"  # payload: {"order_id": str}
SEND_REPORT_EMAIL = "send_report_email"  # payload: {"order_id": str} — the email token is created at send time
CLEANUP = "cleanup"  # payload: {} — expire reports, abandon unpaid orders, purge personal data


def enqueue(
    db: Session,
    kind: str,
    payload: dict[str, Any] | None = None,
    *,
    dedupe_key: str | None = None,
    run_at: datetime | None = None,
    max_attempts: int = 5,
) -> int | None:
    """Insert a job in the caller's transaction.

    With ``dedupe_key`` the insert is idempotent (``ON CONFLICT DO NOTHING``); returns the new job
    id, or ``None`` if a job with the same key already exists.
    """
    stmt = (
        insert(Job)
        .values(
            kind=kind,
            payload=payload or {},
            dedupe_key=dedupe_key,
            status=JobStatus.PENDING.value,
            run_at=run_at or utcnow(),
            attempts=0,
            max_attempts=max_attempts,
        )
        .on_conflict_do_nothing(index_elements=["dedupe_key"])
        .returning(Job.id)
    )
    return db.execute(stmt).scalar_one_or_none()


def claim_next(db: Session, worker_id: str, lease_seconds: int, kinds: list[str] | None = None) -> Job | None:
    """Atomically claim one runnable job (pending & due, or running with an expired lease).

    The caller must commit right after so the claim is visible to other workers.
    """
    now = utcnow()
    row = db.execute(
        text(
            """
            SELECT id FROM jobs
            WHERE ((status = 'pending' AND run_at <= :now)
                   OR (status = 'running' AND locked_until < :now))
              AND (CAST(:kinds AS text[]) IS NULL OR kind = ANY(CAST(:kinds AS text[])))
            ORDER BY run_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        ),
        {"now": now, "kinds": kinds},
    ).first()
    if row is None:
        return None
    job = db.get(Job, row[0])
    assert job is not None
    job.status = JobStatus.RUNNING
    job.attempts += 1
    job.locked_by = worker_id
    job.locked_until = now + timedelta(seconds=lease_seconds)
    db.flush()
    return job


def mark_done(job: Job) -> None:
    job.status = JobStatus.DONE
    job.finished_at = utcnow()
    job.locked_by = None
    job.locked_until = None
    job.last_error = None


def mark_failed_attempt(job: Job, error: str, *, retryable: bool = True) -> None:
    """Schedule a retry with exponential backoff + jitter, or fail permanently."""
    job.last_error = error[:4000]
    job.locked_by = None
    job.locked_until = None
    if retryable and job.attempts < job.max_attempts:
        delay = min(600.0, 5.0 * (2 ** (job.attempts - 1))) * random.uniform(0.75, 1.25)
        job.status = JobStatus.PENDING
        job.run_at = utcnow() + timedelta(seconds=delay)
    else:
        job.status = JobStatus.FAILED
        job.finished_at = utcnow()
