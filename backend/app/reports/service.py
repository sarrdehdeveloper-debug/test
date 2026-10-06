"""Report lifecycle: build the PDF for a generated order, extend access, re-send the email."""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.charts.schemas import Chart
from app.generation.service import REPORT_SLOTS
from app.jobs.queue import SEND_REPORT_EMAIL, enqueue
from app.jobs.registry import PermanentJobError
from app.models import Order, OrderStatus, Report, ReportSection, SectionStatus
from app.reports import storage
from app.reports.pdf import render_report_pdf
from app.security import new_report_file_key
from app.settings_store import get_setting
from app.utils import utcnow

logger = logging.getLogger(__name__)

REQUIRED_SLOTS = frozenset(REPORT_SLOTS)
MAX_EXTEND_HOURS = 24 * 30
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


class ReportBuildError(PermanentJobError, ValueError):
    """The order cannot get a report (yet): retrying the job without a change to the order won't help."""


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

    Requires the 6 sections to be done (``ReportBuildError``, a permanent job error, otherwise).
    Sets the order ``ready``, starts the access window and enqueues the delivery email (deduplicated
    per order). Re-running replaces the previous file. Rendering errors propagate unchanged, so the
    calling job retries them.
    """
    _ensure_buildable(order)
    sections = _required_sections(db, order)

    pdf = render_report_pdf(order, sections)
    file_key = new_report_file_key()
    storage.save_report(file_key, pdf)
    try:
        report, previous_key = _publish(db, order, file_key, pdf)
        db.commit()
    except BaseException:
        db.rollback()
        storage.delete_report(file_key)  # never leave an orphan file behind
        raise
    if previous_key and previous_key != file_key:
        _delete_file_quietly(previous_key)
    logger.info("Report ready for order %s (%d bytes)", order.id, report.size_bytes)
    return report


def _ensure_buildable(order: Order) -> None:
    if order.status not in BUILDABLE_STATUSES:
        raise ReportBuildError(f"Order status {order.status.value!r} cannot have a report")
    try:
        Chart.model_validate(order.chart)
    except ValidationError as exc:
        raise ReportBuildError("Order chart is invalid") from exc


def _required_sections(db: Session, order: Order) -> list[ReportSection]:
    sections = [s for s in completed_sections(db, order) if s.slot in REQUIRED_SLOTS]
    missing = REQUIRED_SLOTS - {s.slot for s in sections}
    if missing:
        raise ReportBuildError(f"Report sections not completed: {sorted(missing)}")
    return sections


def _publish(db: Session, order: Order, file_key: str, pdf: bytes) -> tuple[Report, str | None]:
    """Point the order's report row at the new file and mark the order ready (caller commits)."""
    # Rendering takes seconds: lock the order and re-check, so e.g. a refund processed meanwhile
    # is not overwritten with "ready".
    db.refresh(order, with_for_update=True)
    _ensure_buildable(order)

    now = utcnow()
    access_hours = int(get_setting(db, "report_access_hours"))
    report = db.scalar(select(Report).where(Report.order_id == order.id).with_for_update())
    previous_key: str | None = None
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
    return report, previous_key


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
    Raises ``ValueError`` for bad hours, ``ReportFileGone`` / ``ReportBuildError`` when there is
    nothing downloadable to extend.
    """
    if not 1 <= hours <= MAX_EXTEND_HOURS:
        raise ValueError(f"hours must be between 1 and {MAX_EXTEND_HOURS}")
    report = db.scalar(select(Report).where(Report.order_id == order.id).with_for_update())
    if report is None or report.deleted_at is not None or not storage.report_exists(report.file_key):
        raise ReportFileGone("The report file no longer exists")
    if order.status not in (OrderStatus.READY, OrderStatus.EXPIRED):
        raise ReportBuildError(f"Order status {order.status.value!r} has no downloadable report")
    report.expires_at = max(report.expires_at, utcnow()) + timedelta(hours=hours)
    order.status = OrderStatus.READY
    db.flush()
    return report.expires_at
