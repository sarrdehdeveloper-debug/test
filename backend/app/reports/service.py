"""Report lifecycle: build the PDF for a generated order, extend access, re-send the email."""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.jobs.queue import SEND_REPORT_EMAIL, enqueue
from app.models import Order, OrderStatus, Report, ReportSection, SectionStatus
from app.reports import storage
from app.reports.pdf import render_report_pdf
from app.security import new_report_file_key
from app.settings_store import get_setting
from app.utils import utcnow

logger = logging.getLogger(__name__)

SECTIONS_REQUIRED = 6
REQUIRED_SLOTS = frozenset(range(1, SECTIONS_REQUIRED + 1))
# A report can only be (re)built for orders that were paid and not refunded.
BUILDABLE_STATUSES = frozenset(
    {
        OrderStatus.PAID,
        OrderStatus.QUEUED,
        OrderStatus.GENERATING,
        OrderStatus.GENERATION_FAILED,
        OrderStatus.READY,
        OrderStatus.EXPIRED,
    }
)


class ReportBuildError(ValueError):
    """The order cannot get a report (yet). Not retryable without a change to the order."""


class ReportFileGone(ValueError):
    """The PDF was already deleted, so access cannot be extended (the report must be regenerated)."""


def completed_sections(db: Session, order: Order) -> list[ReportSection]:
    return list(
        db.scalars(
            select(ReportSection)
            .where(ReportSection.order_id == order.id, ReportSection.status == SectionStatus.DONE)
            .order_by(ReportSection.slot)
        )
    )


def build_report(db: Session, order: Order) -> Report:
    """Render, store and publish the PDF for ``order``; commits.

    Requires the 6 sections to be done. Sets the order ``ready``, starts the access window and
    enqueues the delivery email (deduplicated per order). Re-running replaces the previous file.
    """
    if order.status not in BUILDABLE_STATUSES:
        raise ReportBuildError(f"Order status {order.status.value!r} cannot have a report")
    sections = completed_sections(db, order)
    missing = REQUIRED_SLOTS - {s.slot for s in sections}
    if missing:
        raise ReportBuildError(f"Report sections not completed: {sorted(missing)}")

    pdf = render_report_pdf(order, [s for s in sections if s.slot in REQUIRED_SLOTS])
    file_key = new_report_file_key()
    storage.save_report(file_key, pdf)
    previous_key: str | None = None
    try:
        now = utcnow()
        access_hours = int(get_setting(db, "report_access_hours"))
        report = db.scalar(select(Report).where(Report.order_id == order.id).with_for_update())
        if report is None:
            report = Report(order_id=order.id)
            db.add(report)
        elif report.deleted_at is None:
            previous_key = report.file_key
        _reset_report(report, file_key=file_key, pdf=pdf, now=now, expires_at=now + timedelta(hours=access_hours))
        order.status = OrderStatus.READY
        order.ready_at = now
        order.last_error = None
        enqueue(db, SEND_REPORT_EMAIL, {"order_id": str(order.id)}, dedupe_key=f"send_report_email:{order.id}")
        db.commit()
    except BaseException:
        db.rollback()
        storage.delete_report(file_key)  # never leave an orphan file behind
        raise
    if previous_key and previous_key != file_key:
        _delete_file_quietly(previous_key)
    logger.info("Report ready for order %s (%d bytes)", order.id, report.size_bytes)
    return report


def _reset_report(report: Report, *, file_key: str, pdf: bytes, now: datetime, expires_at: datetime) -> None:
    report.file_key = file_key
    report.size_bytes = len(pdf)
    report.sha256 = hashlib.sha256(pdf).hexdigest()
    report.created_at = now
    report.expires_at = expires_at
    # A new file means a new delivery: old email links stop working.
    report.email_token_hash = None
    report.email_sent_at = None
    report.download_count = 0
    report.last_download_at = None
    report.deleted_at = None


def _delete_file_quietly(file_key: str) -> None:
    try:
        storage.delete_report(file_key)
    except OSError:
        logger.exception("Could not delete replaced report file")


def enqueue_report_email(db: Session, order: Order, *, resend: bool = False) -> int | None:
    """Queue the delivery email (caller commits).

    The first delivery is deduplicated per order; ``resend=True`` (admin action) always queues a new
    email, which rotates the email token so the previous email link stops working.
    """
    key = f"send_report_email:{order.id}:resend:{uuid.uuid4().hex}" if resend else f"send_report_email:{order.id}"
    return enqueue(db, SEND_REPORT_EMAIL, {"order_id": str(order.id)}, dedupe_key=key)


def extend_report_access(db: Session, order: Order, hours: int) -> datetime:
    """Extend the download window by ``hours`` (from now if it already lapsed); caller commits.

    Re-opens an order that expired while its file still exists (cleanup not run yet).
    """
    if not 1 <= hours <= 24 * 30:
        raise ValueError("hours must be between 1 and 720")
    report = db.scalar(select(Report).where(Report.order_id == order.id).with_for_update())
    if report is None or report.deleted_at is not None or not storage.report_exists(report.file_key):
        raise ReportFileGone("The report file no longer exists")
    if order.status not in (OrderStatus.READY, OrderStatus.EXPIRED):
        raise ReportBuildError(f"Order status {order.status.value!r} has no downloadable report")
    report.expires_at = max(report.expires_at, utcnow()) + timedelta(hours=hours)
    order.status = OrderStatus.READY
    db.flush()
    return report.expires_at
