"""Discount codes (managers). Redemption counting and checkout validation live in ``app.orders``."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.content.admin_schemas import DiscountCreate, DiscountUpdate
from app.content.common import apply_changes, field_error, flush_or_conflict, paginate
from app.errors import ApiError, not_found
from app.models import DiscountCode, DiscountKind, Order

CODE_TAKEN = ("code_taken", "A discount with this code already exists")


def list_discounts(db: Session, page: int, page_size: int) -> tuple[list[DiscountCode], int]:
    stmt = select(DiscountCode).order_by(DiscountCode.created_at.desc(), DiscountCode.id.desc())
    return paginate(db, stmt, page, page_size)


def get_discount(db: Session, discount_id: int) -> DiscountCode:
    discount = db.get(DiscountCode, discount_id)
    if discount is None:
        raise not_found("discount")
    return discount


def _check_code_free(db: Session, code: str, exclude_id: int | None = None) -> None:
    stmt = select(DiscountCode.id).where(DiscountCode.code == code)
    if exclude_id is not None:
        stmt = stmt.where(DiscountCode.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise ApiError(409, *CODE_TAKEN)


def _normalized_rules(
    kind: DiscountKind, value: int, currency: str | None, starts_at: datetime | None, ends_at: datetime | None
) -> str | None:
    """Check the cross-field rules; return the currency to store (only fixed discounts carry one)."""
    if kind == DiscountKind.PERCENT:
        if value > 100:
            raise field_error("value", "A percent discount must be between 1 and 100")
        currency = None
    elif currency is None:
        raise field_error("currency", "A fixed discount needs a 3-letter currency")
    if starts_at is not None and ends_at is not None and ends_at <= starts_at:
        raise field_error("ends_at", "ends_at must be after starts_at")
    return currency


def create_discount(db: Session, body: DiscountCreate) -> DiscountCode:
    _check_code_free(db, body.code)
    values = body.model_dump()
    values["currency"] = _normalized_rules(body.kind, body.value, body.currency, body.starts_at, body.ends_at)
    discount = DiscountCode(**values)
    db.add(discount)
    flush_or_conflict(db, *CODE_TAKEN)
    return discount


def update_discount(db: Session, discount: DiscountCode, body: DiscountUpdate) -> list[str]:
    changes: dict[str, Any] = body.changes()
    if "code" in changes:
        _check_code_free(db, changes["code"], exclude_id=discount.id)
    merged = {
        name: changes.get(name, getattr(discount, name))
        for name in ("kind", "value", "currency", "starts_at", "ends_at")
    }
    changes["currency"] = _normalized_rules(**merged)
    changed = apply_changes(discount, changes)
    flush_or_conflict(db, *CODE_TAKEN)
    return changed


def is_in_use(db: Session, discount: DiscountCode) -> bool:
    if discount.redemptions_count > 0:
        return True
    return bool(db.scalar(select(exists().where(Order.discount_code_id == discount.id))))


def delete_or_deactivate(db: Session, discount: DiscountCode) -> bool:
    """Delete an unused code; deactivate one that orders reference (keeps their history). True = deleted."""
    if is_in_use(db, discount):
        discount.is_active = False
        db.flush()
        return False
    db.delete(discount)
    db.flush()
    return True
