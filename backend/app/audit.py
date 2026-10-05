"""Audit log helper for admin actions (prompts, discounts, settings, content...)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import AdminUser, AuditLog


def record(
    db: Session,
    user: AdminUser | None,
    action: str,
    entity_type: str,
    entity_id: object | None = None,
    data: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    """Add an audit entry to the session (caller commits with the change itself)."""
    entry = AuditLog(
        user_id=user.id if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=None if entity_id is None else str(entity_id),
        data=data or {},
        ip=ip,
    )
    db.add(entry)
    return entry
