"""Admin users (owner only) and audit log (managers); mounted at ``/api/v1/admin``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.orm import Session

from app.admin_auth import service
from app.admin_auth.deps import require_manager, require_owner
from app.admin_auth.schemas import (
    MAX_DB_ID,
    AuditLogListOut,
    AuditLogOut,
    AuditLogQuery,
    ManagedUserOut,
    PageQuery,
    UserCreateIn,
    UserListOut,
    UserUpdateIn,
)
from app.db import get_db
from app.models import AdminUser
from app.utils import client_ip

router = APIRouter()

UserId = Annotated[int, Path(ge=1, le=MAX_DB_ID)]


@router.get("/users")
def list_users(
    params: Annotated[PageQuery, Query()],
    _owner: AdminUser = Depends(require_owner),
    db: Session = Depends(get_db),
) -> UserListOut:
    users, total = service.list_users(db, page=params.page, page_size=params.page_size)
    return UserListOut(
        items=[ManagedUserOut.from_user(u) for u in users], total=total, page=params.page, page_size=params.page_size
    )


@router.post("/users", status_code=201)
def create_user(
    body: UserCreateIn,
    request: Request,
    actor: AdminUser = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ManagedUserOut:
    user = service.create_user(db, actor, body, ip=client_ip(request))
    db.commit()
    return ManagedUserOut.from_user(user)


@router.patch("/users/{user_id}")
def update_user(
    user_id: UserId,
    body: UserUpdateIn,
    request: Request,
    actor: AdminUser = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ManagedUserOut:
    user = service.update_user(db, actor, user_id, body, ip=client_ip(request))
    db.commit()
    return ManagedUserOut.from_user(user)


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: UserId,
    request: Request,
    actor: AdminUser = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ManagedUserOut:
    user = service.deactivate_user(db, actor, user_id, ip=client_ip(request))
    db.commit()
    return ManagedUserOut.from_user(user)


@router.get("/audit-logs")
def list_audit_logs(
    params: Annotated[AuditLogQuery, Query()],
    _manager: AdminUser = Depends(require_manager),
    db: Session = Depends(get_db),
) -> AuditLogListOut:
    rows, total = service.list_audit_logs(db, params)
    items = [
        AuditLogOut(
            id=entry.id,
            created_at=entry.created_at,
            user_id=entry.user_id,
            user_email=email,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            data=entry.data or {},
            ip=entry.ip,
        )
        for entry, email in rows
    ]
    return AuditLogListOut(items=items, total=total, page=params.page, page_size=params.page_size)
