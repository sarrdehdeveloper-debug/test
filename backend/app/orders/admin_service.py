"""Order administration: search, detail, generation retry, email resend, access extension,
dashboard figures and the job queue view. Callers commit and write the audit entry."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any, Final

from sqlalchemy import ColumnElement, Select, String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.generation.service import SECTIONS_TOTAL, count_done_sections
from app.jobs.queue import GENERATE_REPORT, SEND_REPORT_EMAIL, enqueue
from app.models import (
    DiscountCode,
    FreeReadingRequest,
    Job,
    JobStatus,
    Order,
    OrderStatus,
    PaymentEvent,
    Report,
    ReportSection,
)
from app.orders.schemas import (
    AdminChartSummary,
    AdminJobOut,
    AdminOrderDetail,
    AdminOrderItem,
    AdminPaymentEventOut,
    AdminReportOut,
    AdminSectionOut,
    DashboardOut,
    Progress,
    WindowCounts,
)
from app.orders.service import birth_time_label, chart_signs, is_download_available, nested_str, parse_order_id
from app.payments.service import generate_report_dedupe_key
from app.settings_store import get_setting
from app.utils import utcnow

SECTION_CONTENT_PREVIEW: Final = 2000
RECENT_ORDERS: Final = 5
DETAIL_LIST_LIMIT: Final = 100
# Paid orders whose generation stopped without an active job (e.g. a job deleted by hand).
STUCK_STATUSES: Final = frozenset({OrderStatus.PAID, OrderStatus.QUEUED, OrderStatus.GENERATING})
ACTIVE_JOB_STATUSES: Final = frozenset({JobStatus.PENDING, JobStatus.RUNNING})


def get_order(db: Session, raw_order_id: str, *, lock: bool = False) -> Order:
    order_id = parse_order_id(raw_order_id)
    if order_id is None:
        raise ApiError(404, "not_found", "order not found")
    stmt = select(Order).where(Order.id == order_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    order = db.scalar(stmt)
    if order is None:
        raise ApiError(404, "not_found", "order not found")
    return order


# ---------------------------------------------------------------------------
# Listing & detail
# ---------------------------------------------------------------------------


def _order_rows() -> Select[tuple[Order, str | None]]:
    return select(Order, DiscountCode.code).outerjoin(DiscountCode, DiscountCode.id == Order.discount_code_id)


def order_item(order: Order, discount_code: str | None) -> AdminOrderItem:
    return AdminOrderItem(
        id=order.id,
        status=order.status,
        email=order.email,
        amount_cents=order.amount_cents,
        currency=order.currency,
        created_at=order.created_at,
        paid_at=order.paid_at,
        ready_at=order.ready_at,
        locale=order.locale,
        discount_code=discount_code,
    )


def list_orders(
    db: Session, *, status: OrderStatus | None, q: str | None, page: int, page_size: int
) -> tuple[list[AdminOrderItem], int]:
    """Newest first. ``q`` matches an order id (full or leading part) or an e-mail substring."""
    conditions: list[ColumnElement[bool]] = []
    if status is not None:
        conditions.append(Order.status == status)
    search = (q or "").strip()
    if search:
        conditions.append(_search_condition(search))
    total = db.scalar(select(func.count()).select_from(Order).where(*conditions)) or 0
    rows = db.execute(
        _order_rows()
        .where(*conditions)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return [order_item(order, code) for order, code in rows], total


def _search_condition(search: str) -> ColumnElement[bool]:
    exact_id = parse_order_id(search)
    if exact_id is not None:
        return Order.id == exact_id
    return or_(
        Order.email.icontains(search.lower(), autoescape=True),
        cast(Order.id, String).startswith(search.lower(), autoescape=True),
    )


def order_detail(db: Session, order: Order) -> AdminOrderDetail:
    code = db.scalar(select(DiscountCode.code).where(DiscountCode.id == order.discount_code_id))
    report = db.scalar(select(Report).where(Report.order_id == order.id))
    chart: dict[str, Any] = order.chart or {}
    warnings = chart.get("warnings")
    return AdminOrderDetail(
        **order_item(order, code).model_dump(),
        display_name=order.display_name,
        marketing_opt_in=order.marketing_opt_in,
        birth_date=order.birth_date,
        birth_time=birth_time_label(order.birth_time),
        place_label=order.place_label,
        timezone=order.timezone,
        list_price_cents=order.list_price_cents,
        discount_cents=order.discount_cents,
        payment_provider=order.payment_provider,
        provider_session_id=order.provider_session_id,
        provider_payment_id=order.provider_payment_id,
        updated_at=order.updated_at,
        generation_started_at=order.generation_started_at,
        last_error=order.last_error,
        personal_data_purged_at=order.personal_data_purged_at,
        prompt_version_ids=list(order.prompt_version_ids or []),
        download_available=is_download_available(order, report, utcnow()),
        progress=Progress(sections_done=count_done_sections(db, order.id), sections_total=SECTIONS_TOTAL),
        chart=AdminChartSummary(
            calc_version=order.calc_version,
            signs=chart_signs(chart),
            warnings=[w for w in warnings if isinstance(w, str)] if isinstance(warnings, list) else [],
            year_boundary=nested_str(chart, "chinese", "year_boundary"),
            day_boundary=nested_str(chart, "chinese", "day_boundary"),
        ),
        sections=[_section_out(s) for s in _sections(db, order.id)],
        report=_report_out(report) if report is not None else None,
        payment_events=[_event_out(e) for e in _payment_events(db, order.id)],
        jobs=[job_out(j) for j in _order_jobs(db, order.id)],
    )


def _sections(db: Session, order_id: uuid.UUID) -> list[ReportSection]:
    stmt = select(ReportSection).where(ReportSection.order_id == order_id).order_by(ReportSection.slot)
    return list(db.scalars(stmt))


def _section_out(section: ReportSection) -> AdminSectionOut:
    content = section.content or ""
    return AdminSectionOut(
        slot=section.slot,
        title=section.title,
        status=section.status,
        attempts=section.attempts,
        word_count=section.word_count,
        model=section.model,
        content=content[:SECTION_CONTENT_PREVIEW],
        content_truncated=len(content) > SECTION_CONTENT_PREVIEW,
        last_error=section.last_error,
        input_tokens=section.input_tokens,
        output_tokens=section.output_tokens,
        updated_at=section.updated_at,
    )


def _report_out(report: Report) -> AdminReportOut:
    return AdminReportOut(
        created_at=report.created_at,
        expires_at=report.expires_at,
        email_sent_at=report.email_sent_at,
        download_count=report.download_count,
        last_download_at=report.last_download_at,
        deleted_at=report.deleted_at,
        size_bytes=report.size_bytes,
    )


def _payment_events(db: Session, order_id: uuid.UUID) -> list[PaymentEvent]:
    return list(
        db.scalars(
            select(PaymentEvent)
            .where(PaymentEvent.order_id == order_id)
            .order_by(PaymentEvent.received_at, PaymentEvent.id)
            .limit(DETAIL_LIST_LIMIT)
        )
    )


def _event_out(event: PaymentEvent) -> AdminPaymentEventOut:
    return AdminPaymentEventOut(
        id=event.id,
        provider=event.provider,
        event_id=event.event_id,
        event_type=event.event_type,
        outcome=event.outcome,
        received_at=event.received_at,
        data=dict(event.data or {}),
    )


def _order_jobs(db: Session, order_id: uuid.UUID) -> list[Job]:
    return list(
        db.scalars(
            select(Job)
            .where(Job.payload["order_id"].astext == str(order_id))
            .order_by(Job.created_at, Job.id)
            .limit(DETAIL_LIST_LIMIT)
        )
    )


def job_out(job: Job) -> AdminJobOut:
    order_ref = (job.payload or {}).get("order_id")
    return AdminJobOut(
        id=job.id,
        kind=job.kind,
        status=job.status,
        attempts=job.attempts,
        max_attempts=job.max_attempts,
        run_at=job.run_at,
        created_at=job.created_at,
        finished_at=job.finished_at,
        last_error=job.last_error,
        dedupe_key=job.dedupe_key,
        order_id=order_ref if isinstance(order_ref, str) else None,
    )


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


def retry_generation(db: Session, order: Order) -> tuple[OrderStatus, int]:
    """Re-run report generation for a failed or stuck order; returns (previous status, job id).

    The original job carries ``dedupe_key="generate_report:<id>"``, so it is reset in place:
    enqueuing a second job with that key would be silently dropped. Finished sections are kept.
    """
    job = db.scalar(select(Job).where(Job.dedupe_key == generate_report_dedupe_key(order.id)).with_for_update())
    if order.status != OrderStatus.GENERATION_FAILED and order.status not in STUCK_STATUSES:
        raise ApiError(409, "order_not_retryable", f"Orders in status {order.status.value!r} cannot be regenerated")
    if job is not None and job.status in ACTIVE_JOB_STATUSES:
        raise ApiError(409, "generation_in_progress", "A generation job for this order is already pending or running")

    previous = order.status
    now = utcnow()
    if job is None:
        job_id = enqueue(
            db,
            GENERATE_REPORT,
            {"order_id": str(order.id)},
            dedupe_key=generate_report_dedupe_key(order.id),
            run_at=now,
        )
        assert job_id is not None  # the row lock above saw no job with this key
    else:
        reset_job(job, now)
        job_id = job.id
    order.status = OrderStatus.QUEUED
    order.last_error = None
    db.flush()
    return previous, job_id


def reset_job(job: Job, now: datetime) -> None:
    job.status = JobStatus.PENDING
    job.attempts = 0
    job.run_at = now
    job.last_error = None
    job.finished_at = None
    job.locked_by = None
    job.locked_until = None


def _downloadable_report(db: Session, order: Order) -> Report:
    """The order's report if the PDF can still be delivered; 409 ``report_not_available`` otherwise."""
    from app.reports import storage  # lazy: keeps the orders module importable on its own

    report = db.scalar(select(Report).where(Report.order_id == order.id).with_for_update())
    if order.status != OrderStatus.READY or report is None or report.deleted_at is not None:
        raise ApiError(409, "report_not_available", "This order has no available report")
    try:
        exists = storage.report_exists(report.file_key)
    except storage.InvalidFileKey:
        exists = False
    if not exists:
        raise ApiError(409, "report_not_available", "The report file no longer exists")
    return report


def resend_email(db: Session, order: Order) -> int:
    """Queue another delivery e-mail (no dedupe key: every resend is a new job, with a new email token)."""
    report = _downloadable_report(db, order)
    if report.expires_at <= utcnow():
        raise ApiError(409, "report_not_available", "The report access has expired; extend it first")
    job_id = enqueue(db, SEND_REPORT_EMAIL, {"order_id": str(order.id)})
    assert job_id is not None  # without a dedupe key the insert cannot conflict
    return job_id


def extend_access(db: Session, order: Order, hours: int) -> datetime:
    """Extend the download window by ``hours``, counted from now if it already lapsed."""
    report = _downloadable_report(db, order)
    report.expires_at = max(report.expires_at, utcnow()) + timedelta(hours=hours)
    db.flush()
    return report.expires_at


def retry_job(db: Session, job_id: int) -> Job:
    """Put a failed job back in the queue. A generate job also re-queues its failed order.

    Locks the order before the job, the same order as ``retry_generation``, so the two admin
    actions cannot deadlock each other.
    """
    job = db.get(Job, job_id)
    if job is None:
        raise ApiError(404, "not_found", "job not found")
    order = _generation_order(db, job)
    job = db.scalar(select(Job).where(Job.id == job_id).with_for_update().execution_options(populate_existing=True))
    if job is None or job.status != JobStatus.FAILED:
        raise ApiError(409, "job_not_failed", "Only failed jobs can be retried")
    reset_job(job, utcnow())
    if order is not None and order.status == OrderStatus.GENERATION_FAILED:
        order.status = OrderStatus.QUEUED
        order.last_error = None
    db.flush()
    return job


def _generation_order(db: Session, job: Job) -> Order | None:
    """The locked order of a ``generate_report`` job (``None`` for other kinds)."""
    if job.kind != GENERATE_REPORT:
        return None
    order_id = parse_order_id(str((job.payload or {}).get("order_id")))
    if order_id is None:
        return None
    return db.scalar(
        select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True)
    )


def list_jobs(db: Session, *, status: JobStatus, page: int, page_size: int) -> tuple[list[AdminJobOut], int]:
    total = db.scalar(select(func.count()).select_from(Job).where(Job.status == status)) or 0
    jobs = db.scalars(
        select(Job).where(Job.status == status).order_by(Job.id.desc()).limit(page_size).offset((page - 1) * page_size)
    )
    return [job_out(job) for job in jobs], total


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


def dashboard(db: Session, now: datetime) -> DashboardOut:
    """Headline figures. "today" starts at 00:00 UTC; the other windows are rolling."""
    starts = {
        "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
        "last_7_days": now - timedelta(days=7),
        "last_30_days": now - timedelta(days=30),
    }
    currency = str(get_setting(db, "currency")).upper()
    paid = Order.paid_at.is_not(None) & (Order.status != OrderStatus.REFUNDED)
    in_currency = paid & (Order.currency == currency)

    order_counts = db.execute(
        select(*(func.count().filter(paid, Order.paid_at >= start) for start in starts.values()))
    ).one()
    revenue = db.execute(
        select(
            *(
                func.coalesce(func.sum(Order.amount_cents).filter(in_currency, Order.paid_at >= start), 0)
                for start in starts.values()
            )
        )
    ).one()
    free_counts = db.execute(
        select(*(func.count().filter(FreeReadingRequest.created_at >= start) for start in starts.values()))
    ).one()

    status_counts = {status.value: 0 for status in OrderStatus}
    for status, count in db.execute(select(Order.status, func.count()).group_by(Order.status)):
        status_counts[OrderStatus(status).value] = count

    recent = db.execute(_order_rows().order_by(Order.created_at.desc(), Order.id.desc()).limit(RECENT_ORDERS)).all()
    return DashboardOut(
        orders=_windows(order_counts),
        revenue_cents=_windows(revenue),
        currency=currency,
        status_counts=status_counts,
        free_readings=_windows(free_counts),
        failed_jobs=db.scalar(select(func.count()).select_from(Job).where(Job.status == JobStatus.FAILED)) or 0,
        recent_orders=[order_item(order, code) for order, code in recent],
    )


def _windows(values: Any) -> WindowCounts:
    today, week, month = (int(v or 0) for v in values)
    return WindowCounts(today=today, last_7_days=week, last_30_days=month)
