"""Admin orders API, mounted at ``/api/v1/admin`` (docs/ARCHITECTURE.md §6, Orders row; managers only)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.orm import Session

from app import audit
from app.admin_auth.deps import require_manager
from app.db import get_db
from app.models import AdminUser, JobStatus, OrderStatus
from app.orders import admin_service
from app.orders.schemas import (
    ADMIN_PAGE_SIZE_MAX,
    AdminJobList,
    AdminJobOut,
    AdminOrderDetail,
    AdminOrderList,
    DashboardOut,
    ExtendAccessIn,
    ExtendAccessOut,
    ResendEmailOut,
    RetryGenerationOut,
)
from app.utils import client_ip, utcnow

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]
Manager = Annotated[AdminUser, Depends(require_manager)]
Page = Annotated[int, Query(ge=1, le=100_000)]
PageSize = Annotated[int, Query(ge=1, le=ADMIN_PAGE_SIZE_MAX)]
JobId = Annotated[int, Path(ge=1, le=2**63 - 1)]  # BIGINT range


@router.get("/orders", response_model=AdminOrderList)
def list_orders(
    _: Manager,
    db: DbSession,
    status: OrderStatus | None = None,
    q: Annotated[str | None, Query(max_length=320)] = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> AdminOrderList:
    items, total = admin_service.list_orders(db, status=status, q=q, page=page, page_size=page_size)
    return AdminOrderList(items=items, total=total, page=page, page_size=page_size)


@router.get("/orders/{order_id}", response_model=AdminOrderDetail)
def get_order(order_id: str, _: Manager, db: DbSession) -> AdminOrderDetail:
    return admin_service.order_detail(db, admin_service.get_order(db, order_id))


@router.post("/orders/{order_id}/retry-generation", response_model=RetryGenerationOut)
def retry_generation(order_id: str, request: Request, admin: Manager, db: DbSession) -> RetryGenerationOut:
    order = admin_service.get_order(db, order_id, lock=True)
    previous, job_id = admin_service.retry_generation(db, order)
    audit.record(
        db,
        admin,
        "order.retry_generation",
        "order",
        order.id,
        {"previous_status": previous.value, "job_id": job_id},
        ip=client_ip(request),
    )
    db.commit()
    return RetryGenerationOut(order_id=order.id, status=order.status, job_id=job_id)


@router.post("/orders/{order_id}/resend-email", response_model=ResendEmailOut)
def resend_email(order_id: str, request: Request, admin: Manager, db: DbSession) -> ResendEmailOut:
    order = admin_service.get_order(db, order_id, lock=True)
    job_id = admin_service.resend_email(db, order)
    audit.record(db, admin, "order.resend_email", "order", order.id, {"job_id": job_id}, ip=client_ip(request))
    db.commit()
    return ResendEmailOut(order_id=order.id, job_id=job_id)


@router.post("/orders/{order_id}/extend-access", response_model=ExtendAccessOut)
def extend_access(
    order_id: str, body: ExtendAccessIn, request: Request, admin: Manager, db: DbSession
) -> ExtendAccessOut:
    order = admin_service.get_order(db, order_id, lock=True)
    expires_at = admin_service.extend_access(db, order, body.hours)
    audit.record(
        db,
        admin,
        "order.extend_access",
        "order",
        order.id,
        {"hours": body.hours, "expires_at": expires_at.isoformat()},
        ip=client_ip(request),
    )
    db.commit()
    return ExtendAccessOut(order_id=order.id, expires_at=expires_at)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(_: Manager, db: DbSession) -> DashboardOut:
    return admin_service.dashboard(db, utcnow())


@router.get("/jobs", response_model=AdminJobList)
def list_jobs(
    _: Manager,
    db: DbSession,
    status: JobStatus = JobStatus.FAILED,
    page: Page = 1,
    page_size: PageSize = 20,
) -> AdminJobList:
    items, total = admin_service.list_jobs(db, status=status, page=page, page_size=page_size)
    return AdminJobList(items=items, total=total, page=page, page_size=page_size)


@router.post("/jobs/{job_id}/retry", response_model=AdminJobOut)
def retry_job(job_id: JobId, request: Request, admin: Manager, db: DbSession) -> AdminJobOut:
    job = admin_service.retry_job(db, job_id)
    audit.record(db, admin, "job.retry", "job", job.id, {"kind": job.kind}, ip=client_ip(request))
    db.commit()
    return admin_service.job_out(job)
