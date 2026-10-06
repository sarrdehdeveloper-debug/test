"""Worker job handlers: ``send_report_email`` and the periodic ``cleanup``.

Both are idempotent: re-running a finished job changes nothing (cleanup) or re-sends the email
with a fresh token (send_report_email, only reachable through retries or an admin resend).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.jobs.registry import PermanentJobError
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
from app.reports import storage
from app.reports.emailer import InvalidEmailAddress, send_email
from app.reports.report_email import build_report_email
from app.reports.schemas import CleanupResult, OrderJobPayload
from app.security import hash_token, new_token
from app.settings_store import get_setting
from app.utils import utcnow

logger = logging.getLogger(__name__)

BATCH_SIZE = 200
FINISHED_JOB_RETENTION = timedelta(days=30)
# Login throttling only looks back 15 minutes; the longer retention keeps a trail for investigating abuse.
LOGIN_ATTEMPT_RETENTION = timedelta(days=30)
# Files younger than this may belong to a report that is being written right now.
ORPHAN_FILE_GRACE = timedelta(hours=1)
# Orders still being fulfilled keep their birth data even past the retention period: purging it
# would make a paid report impossible to generate. Ops should resolve such stuck orders.
PURGE_EXEMPT_STATUSES = (OrderStatus.PAID, OrderStatus.QUEUED, OrderStatus.GENERATING)


# ---------------------------------------------------------------------------
# send_report_email
# ---------------------------------------------------------------------------


def handle_send_report_email(db: Session, job: Job) -> None:
    try:
        payload = OrderJobPayload.model_validate(job.payload)
    except ValidationError as exc:
        raise PermanentJobError("Invalid send_report_email payload") from exc

    order = db.get(Order, payload.order_id)
    if order is None:
        raise PermanentJobError("Order not found")
    report = db.scalar(select(Report).where(Report.order_id == order.id).with_for_update())
    now = utcnow()
    if report is None or report.deleted_at is not None or report.expires_at <= now or order.status != OrderStatus.READY:
        logger.info("Skipping report email for order %s: no downloadable report", order.id)
        return
    if not storage.report_exists(report.file_key):
        raise PermanentJobError("Report file is missing from storage")

    attach = bool(get_setting(db, "email_attach_pdf"))
    attachments = None
    if attach:
        attachments = [(storage.DOWNLOAD_FILENAME, storage.read_report(report.file_key), "application/pdf")]

    # Store the new token's hash before sending, so the emailed link works as soon as it arrives.
    # A retry rotates the token again; only the email that was actually delivered matters.
    token = new_token()
    report.email_token_hash = hash_token(token)
    db.commit()

    content = build_report_email(order, report.expires_at, token, attached=attach)
    try:
        send_email(order.email, content.subject, content.text, content.html, attachments)
    except InvalidEmailAddress as exc:
        raise PermanentJobError("Order email address is not deliverable") from exc

    report.email_sent_at = utcnow()
    db.commit()
    logger.info("Report email sent for order %s", order.id)


# ---------------------------------------------------------------------------
# cleanup
# ---------------------------------------------------------------------------


def handle_cleanup(db: Session, job: Job) -> None:  # noqa: ARG001 - handler signature
    started = time.monotonic()
    result = run_cleanup(db)
    logger.info("Cleanup finished in %.1fs: %s", time.monotonic() - started, result.model_dump())


def run_cleanup(db: Session, now: datetime | None = None) -> CleanupResult:
    """Run every retention rule once (commits per batch). Safe to run repeatedly."""
    now = now or utcnow()
    result = CleanupResult()
    result.reports_expired = expire_reports(db, now)
    delete_orphan_report_files(db, now)
    result.orders_abandoned = abandon_unpaid_orders(db, now)
    result.orders_purged, result.free_requests_purged = purge_personal_data(db, now)
    result.admin_sessions_deleted, result.login_attempts_deleted, result.jobs_deleted = delete_stale_rows(db, now)
    return result


def expire_reports(db: Session, now: datetime) -> int:
    """Delete files whose access window ended (or whose order was refunded); mark orders expired."""
    count = 0
    while True:
        reports = db.scalars(
            select(Report)
            .join(Order, Order.id == Report.order_id)
            .where(Report.deleted_at.is_(None), or_(Report.expires_at <= now, Order.status == OrderStatus.REFUNDED))
            .order_by(Report.id)
            .limit(BATCH_SIZE)
            .with_for_update(of=Report, skip_locked=True)
        ).all()
        if not reports:
            return count
        for report in reports:
            _delete_report_file(report.file_key)
            report.deleted_at = now
            report.email_token_hash = None
        # Conditional update (the order rows are not locked): an order refunded meanwhile stays refunded.
        db.execute(
            update(Order)
            .where(Order.id.in_([r.order_id for r in reports]), Order.status == OrderStatus.READY)
            .values(status=OrderStatus.EXPIRED)
            .execution_options(synchronize_session=False)
        )
        db.commit()
        count += len(reports)


def _delete_report_file(file_key: str) -> None:
    try:
        storage.delete_report(file_key)
    except storage.InvalidFileKey:
        logger.error("Report row has an invalid file key; nothing deleted")


def delete_orphan_report_files(db: Session, now: datetime) -> int:
    """Remove PDFs without a live report row (e.g. a crash between writing and committing)."""
    directory = storage.reports_dir()
    if not directory.is_dir():
        return 0
    cutoff = (now - ORPHAN_FILE_GRACE).timestamp()
    stale = [
        p
        for p in directory.iterdir()
        if p.is_file() and (p.suffix == ".pdf" or p.name.startswith(".tmp-")) and p.stat().st_mtime < cutoff
    ]
    keys = [p.stem for p in stale if storage.FILE_KEY_PATTERN.fullmatch(p.stem)]
    live = (
        set(db.scalars(select(Report.file_key).where(Report.file_key.in_(keys), Report.deleted_at.is_(None))))
        if keys
        else set()
    )
    removed = 0
    for path in stale:
        if path.stem not in live:
            path.unlink(missing_ok=True)
            removed += 1
    if removed:
        logger.warning("Removed %d orphan report file(s)", removed)
    return removed


def abandon_unpaid_orders(db: Session, now: datetime) -> int:
    cutoff = now - timedelta(hours=int(get_setting(db, "abandoned_order_hours")))
    count = 0
    while True:
        ids = (
            select(Order.id)
            .where(Order.status == OrderStatus.AWAITING_PAYMENT, Order.created_at < cutoff)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
            .scalar_subquery()
        )
        updated = db.execute(
            update(Order)
            .where(Order.id.in_(ids), Order.status == OrderStatus.AWAITING_PAYMENT)
            .values(status=OrderStatus.ABANDONED)
            .execution_options(synchronize_session=False)
        ).rowcount
        db.commit()
        count += updated
        if updated < BATCH_SIZE:
            return count


def purge_personal_data(db: Session, now: datetime) -> tuple[int, int]:
    """Erase birth data after the retention period; the derived signs stay for statistics/support."""
    cutoff = now - timedelta(days=int(get_setting(db, "personal_data_retention_days")))
    orders_purged = 0
    while True:
        orders = db.scalars(
            select(Order)
            .where(
                Order.created_at < cutoff,
                Order.personal_data_purged_at.is_(None),
                Order.status.not_in(PURGE_EXEMPT_STATUSES),
            )
            .order_by(Order.created_at)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        ).all()
        if not orders:
            break
        for order in orders:
            _purge_order(order, now)
        db.commit()
        orders_purged += len(orders)

    requests_purged = 0
    while True:
        ids = (
            select(FreeReadingRequest.id)
            .where(FreeReadingRequest.created_at < cutoff, FreeReadingRequest.birth_date.is_not(None))
            .limit(BATCH_SIZE)
            .scalar_subquery()
        )
        updated = db.execute(
            update(FreeReadingRequest)
            .where(FreeReadingRequest.id.in_(ids))
            .values(birth_date=None)
            .execution_options(synchronize_session=False)
        ).rowcount
        db.commit()
        requests_purged += updated
        if updated < BATCH_SIZE:
            break
    return orders_purged, requests_purged


def _purge_order(order: Order, now: datetime) -> None:
    order.birth_date = None
    order.birth_time = None
    order.city_id = None
    order.place_label = None
    order.latitude = None
    order.longitude = None
    order.timezone = None
    order.birth_utc = None
    order.display_name = None
    # The chart input holds the birth instant and place; the derived signs (western/chinese) stay.
    # Reassign (not mutate) so SQLAlchemy sees the JSONB change.
    order.chart = {**(order.chart or {}), "input": None}
    order.personal_data_purged_at = now


def delete_stale_rows(db: Session, now: datetime) -> tuple[int, int, int]:
    sessions = _delete_in_batches(db, AdminSession, AdminSession.expires_at < now)
    attempts = _delete_in_batches(db, LoginAttempt, LoginAttempt.created_at < now - LOGIN_ATTEMPT_RETENTION)
    jobs = _delete_in_batches(
        db,
        Job,
        Job.status.in_([JobStatus.DONE, JobStatus.FAILED]),
        Job.finished_at < now - FINISHED_JOB_RETENTION,
    )
    return sessions, attempts, jobs


def _delete_in_batches(db: Session, model: type[Any], *conditions: ColumnElement[bool]) -> int:
    total = 0
    while True:
        ids = select(model.id).where(*conditions).limit(BATCH_SIZE).scalar_subquery()
        deleted = db.execute(
            delete(model).where(model.id.in_(ids)).execution_options(synchronize_session=False)
        ).rowcount
        db.commit()
        total += deleted
        if deleted < BATCH_SIZE:
            return total
