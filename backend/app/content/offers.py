"""Promotional offers: public listing (banner + offers page) and admin CRUD."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.content.admin_schemas import OfferCreate, OfferUpdate
from app.content.common import apply_changes, field_error, flush_or_conflict, localized, paginate, text_or_none
from app.content.schemas import OfferOut
from app.errors import ApiError, not_found
from app.markdown import render_markdown
from app.models import DiscountCode, Offer

SLUG_TAKEN = ("slug_taken", "An offer with this slug already exists")


# ---------------------------------------------------------------------------
# Visibility
# ---------------------------------------------------------------------------


def _live_clause(now: datetime) -> ColumnElement[bool]:
    return and_(
        Offer.is_active.is_(True),
        or_(Offer.starts_at.is_(None), Offer.starts_at <= now),
        or_(Offer.ends_at.is_(None), Offer.ends_at > now),
    )


def is_live(offer: Offer, now: datetime) -> bool:
    return (
        offer.is_active
        and (offer.starts_at is None or offer.starts_at <= now)
        and (offer.ends_at is None or offer.ends_at > now)
    )


def _usable_code(discount: DiscountCode | None, now: datetime) -> str | None:
    """Advertise a code only while checkout would accept it (avoids promising a dead code)."""
    if discount is None or not discount.is_active:
        return None
    if discount.starts_at is not None and discount.starts_at > now:
        return None
    if discount.ends_at is not None and discount.ends_at <= now:
        return None
    if discount.max_redemptions is not None and discount.redemptions_count >= discount.max_redemptions:
        return None
    return discount.code


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


def live_offers(db: Session, now: datetime, *, banner_only: bool) -> list[Offer]:
    stmt = (
        select(Offer)
        .options(joinedload(Offer.discount_code))
        .where(_live_clause(now))
        .order_by(Offer.sort_order, Offer.id)
    )
    if banner_only:
        stmt = stmt.where(Offer.show_banner.is_(True))
    return list(db.scalars(stmt))


def live_offer(db: Session, slug: str, now: datetime) -> Offer:
    offer = db.scalar(
        select(Offer).options(joinedload(Offer.discount_code)).where(Offer.slug == slug, _live_clause(now))
    )
    if offer is None:
        raise not_found("offer")
    return offer


def offer_out(offer: Offer, locale: str, now: datetime) -> OfferOut:
    text = localized(offer.translations, locale)
    return OfferOut(
        id=offer.id,
        slug=offer.slug,
        title=str(text.get("title") or ""),
        subtitle=text_or_none(text.get("subtitle")),
        body_html=render_markdown(str(text.get("body") or "")),
        cta_label=text_or_none(text.get("cta_label")),
        cta_url=offer.cta_url,
        image_url=offer.image_url,
        show_banner=offer.show_banner,
        discount_code=_usable_code(offer.discount_code, now),
        starts_at=offer.starts_at,
        ends_at=offer.ends_at,
    )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


def list_offers(db: Session, page: int, page_size: int) -> tuple[list[Offer], int]:
    stmt = select(Offer).options(joinedload(Offer.discount_code)).order_by(Offer.sort_order, Offer.id)
    return paginate(db, stmt, page, page_size)


def get_offer(db: Session, offer_id: int) -> Offer:
    offer = db.get(Offer, offer_id)
    if offer is None:
        raise not_found("offer")
    return offer


def _check_slug_free(db: Session, slug: str, exclude_id: int | None = None) -> None:
    stmt = select(Offer.id).where(Offer.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Offer.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise ApiError(409, *SLUG_TAKEN)


def _check_discount_exists(db: Session, discount_code_id: int | None) -> None:
    if discount_code_id is not None and db.get(DiscountCode, discount_code_id) is None:
        raise field_error("discount_code_id", "Discount code not found")


def _check_window(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at is not None and ends_at is not None and ends_at <= starts_at:
        raise field_error("ends_at", "ends_at must be after starts_at")


def create_offer(db: Session, body: OfferCreate) -> Offer:
    _check_slug_free(db, body.slug)
    _check_discount_exists(db, body.discount_code_id)
    _check_window(body.starts_at, body.ends_at)
    offer = Offer(**body.model_dump())
    db.add(offer)
    flush_or_conflict(db, *SLUG_TAKEN)
    return offer


def update_offer(db: Session, offer: Offer, body: OfferUpdate) -> list[str]:
    changes: dict[str, Any] = body.changes()
    if "slug" in changes:
        _check_slug_free(db, changes["slug"], exclude_id=offer.id)
    if "discount_code_id" in changes:
        _check_discount_exists(db, changes["discount_code_id"])
    _check_window(changes.get("starts_at", offer.starts_at), changes.get("ends_at", offer.ends_at))
    changed = apply_changes(offer, changes)
    if "discount_code_id" in changed:
        db.expire(offer, ["discount_code"])  # reload the relationship for the response
    flush_or_conflict(db, *SLUG_TAKEN)
    return changed


def delete_offer(db: Session, offer: Offer) -> None:
    db.delete(offer)
    db.flush()
