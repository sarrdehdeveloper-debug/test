"""Price of the paid report and discount-code validation.

The list price and currency are runtime settings (``settings_store``). A discount code is counted
as redeemed only when an order using it is paid (``app.payments.service``), not when it is quoted.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Final, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import DiscountCode, DiscountKind
from app.orders.schemas import DiscountOut, QuoteOut, normalize_discount_code
from app.settings_store import get_setting

InvalidReason = Literal["not_found", "inactive", "not_started", "expired", "exhausted", "currency_mismatch"]

_MESSAGES: Final[dict[InvalidReason, str]] = {
    "not_found": "This discount code does not exist.",
    "inactive": "This discount code is no longer active.",
    "not_started": "This discount code is not valid yet.",
    "expired": "This discount code has expired.",
    "exhausted": "This discount code has been fully used.",
    "currency_mismatch": "This discount code cannot be used with the current currency.",
}


@dataclass(frozen=True, slots=True)
class Quote:
    list_price_cents: int
    discount_cents: int
    amount_cents: int
    currency: str
    discount: DiscountCode | None

    def to_out(self) -> QuoteOut:
        discount = None
        if self.discount is not None:
            discount = DiscountOut(code=self.discount.code, kind=self.discount.kind, value=self.discount.value)
        return QuoteOut(
            list_price_cents=self.list_price_cents,
            discount_cents=self.discount_cents,
            amount_cents=self.amount_cents,
            currency=self.currency,
            discount=discount,
        )


def invalid_discount(reason: InvalidReason) -> ApiError:
    return ApiError(422, "invalid_discount_code", _MESSAGES[reason], {"reason": reason})


def quote(db: Session, discount_code: str | None, now: datetime) -> Quote:
    """Price for one report with ``discount_code`` applied. Raises ``invalid_discount_code`` (422)."""
    price = int(get_setting(db, "paid_price_cents"))
    currency = str(get_setting(db, "currency")).upper()
    code = normalize_discount_code(discount_code)
    if code is None:
        return Quote(price, 0, price, currency, None)

    discount = db.scalar(select(DiscountCode).where(DiscountCode.code == code))
    if discount is None:
        raise invalid_discount("not_found")
    reason = rejection_reason(discount, currency, now)
    if reason is not None:
        raise invalid_discount(reason)
    discount_cents = discount_amount(discount, price)
    return Quote(price, discount_cents, price - discount_cents, currency, discount)


def rejection_reason(discount: DiscountCode, currency: str, now: datetime) -> InvalidReason | None:
    if not discount.is_active:
        return "inactive"
    if discount.starts_at is not None and now < discount.starts_at:
        return "not_started"
    if discount.ends_at is not None and now >= discount.ends_at:
        return "expired"
    if discount.max_redemptions is not None and discount.redemptions_count >= discount.max_redemptions:
        return "exhausted"
    if discount.kind == DiscountKind.FIXED and (discount.currency or "").upper() != currency:
        return "currency_mismatch"
    return None


def discount_amount(discount: DiscountCode, price_cents: int) -> int:
    """Discount in minor units, never more than the price. Percentages round half up."""
    if discount.kind != DiscountKind.PERCENT:
        return max(0, min(discount.value, price_cents))
    # Integer arithmetic: float rounding would turn e.g. 2900 * 15% into 434 or 435 by luck.
    return max(0, min((price_cents * discount.value + 50) // 100, price_cents))
