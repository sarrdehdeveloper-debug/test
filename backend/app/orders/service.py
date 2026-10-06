"""Public order flow: quote, create (chart + checkout), status for the order page, new checkout.

Handlers commit; functions here only add/flush. Birth data never reaches log lines.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Mapping
from datetime import datetime, time
from typing import Any, Final, get_args

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.astro.timezones import AmbiguousLocalTime, NonexistentLocalTime
from app.charts.schemas import Chart, DayBoundary, YearBoundary
from app.charts.service import BirthDateOutOfRange, Place, build_chart
from app.config import get_settings
from app.errors import ApiError, not_found
from app.generation.service import SECTIONS_TOTAL, count_done_sections
from app.geo.schemas import CityOut
from app.geo.service import get_city_out
from app.models import Order, OrderStatus, Report
from app.orders import pricing
from app.orders.schemas import OrderCreate, OrderCreated, OrderSigns, OrderStatusOut, Progress
from app.payments import service as payments
from app.payments.providers.base import CheckoutSession, PaymentProvider, PaymentProviderError
from app.ratelimit import limiter
from app.security import hash_token, new_token, token_matches
from app.settings_store import DEFAULTS, get_setting
from app.utils import normalize_locale, utcnow

logger = logging.getLogger(__name__)

RATE_LIMIT_WINDOW_SECONDS: Final = 3600
# Quotes are cheap but would let a script enumerate discount codes.
QUOTE_RATE_LIMIT_PER_HOUR: Final = 60
MAX_ORDER_TOKEN_LENGTH: Final = 256
_MINUS_SIGN: Final = "−"
# Compared against when the order does not exist, so both 404 paths do the same work.
_NO_ORDER_TOKEN_HASH: Final = hash_token("zb-no-such-order")


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------


def order_not_found() -> ApiError:
    return ApiError(404, "not_found", "Order not found")


def parse_order_id(raw: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(raw)
    except (TypeError, ValueError):
        return None


def get_order_for_token(db: Session, raw_order_id: str, token: str | None) -> Order:
    """The order if ``token`` is its browser access token. Unknown id, malformed id and wrong token
    all raise the same 404, so the endpoint never reveals which orders exist."""
    order_id = parse_order_id(raw_order_id)
    order = db.get(Order, order_id) if order_id is not None else None
    usable_token = token if token and len(token) <= MAX_ORDER_TOKEN_LENGTH else ""
    if order is None:
        token_matches(usable_token or "-", _NO_ORDER_TOKEN_HASH)
        raise order_not_found()
    if not token_matches(usable_token, order.access_token_hash):
        raise order_not_found()
    return order


# ---------------------------------------------------------------------------
# Rate limits
# ---------------------------------------------------------------------------


def enforce_order_rate_limit(db: Session, ip: str, scope: str = "create") -> None:
    limit = int(get_setting(db, "order_rate_limit_per_hour"))
    limiter.hit(f"orders-{scope}:{ip}", limit, RATE_LIMIT_WINDOW_SECONDS)


def enforce_quote_rate_limit(ip: str) -> None:
    limiter.hit(f"orders-quote:{ip}", QUOTE_RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_SECONDS)


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------


def create_order(db: Session, payload: OrderCreate, ip: str) -> OrderCreated:
    """Validate, compute the chart, price the order and start the checkout (caller commits).

    A fully discounted order is confirmed at once through the normal payment path (provider
    ``free``) and goes straight to ``queued``; its ``checkout_url`` is the order page.
    """
    enforce_order_rate_limit(db, ip)
    if not payload.accept_terms:
        raise ApiError(422, "terms_not_accepted", "Please accept the terms to continue.")
    locale = normalize_locale(payload.locale)
    city = get_city_out(db, payload.city_id, locale)
    if city is None:
        raise not_found("city")
    price = pricing.quote(db, payload.discount_code, utcnow())
    chart = compute_chart(db, payload, city)

    access_token = new_token()
    order = _new_order(payload, locale, city, chart, price, access_token_hash=hash_token(access_token))
    if price.amount_cents == 0:
        checkout_url = _confirm_free_order(db, order)
    else:
        provider = payments.get_provider()
        order.payment_provider = provider.name
        # The session is created before the order is stored: if the provider fails nothing is
        # persisted, and the visitor simply submits the form again.
        session = start_checkout(provider, order)
        order.provider_session_id = session.id
        db.add(order)
        db.flush()
        checkout_url = session.url
    return OrderCreated(
        order_id=order.id,
        access_token=access_token,
        checkout_url=checkout_url,
        amount_cents=order.amount_cents,
        currency=order.currency,
        status=order.status,
    )


def compute_chart(db: Session, payload: OrderCreate, city: CityOut) -> Chart:
    """Build the chart, turning calculation problems into the contract's 422 errors."""
    place = Place(latitude=city.latitude, longitude=city.longitude, timezone=city.timezone, label=city.label)
    try:
        return build_chart(
            payload.birth_date,
            payload.birth_time,
            place,
            fold=payload.time_fold,
            year_boundary=_setting_choice(db, "chinese_year_boundary", YearBoundary),
            day_boundary=_setting_choice(db, "chinese_day_boundary", DayBoundary),
        )
    except AmbiguousLocalTime as exc:
        options = [
            {
                "fold": option.fold,
                "utc_offset_minutes": option.utc_offset_minutes,
                "label": f"{payload.birth_time:%H:%M} ({format_utc_offset(option.utc_offset_minutes)})",
            }
            for option in exc.options
        ]
        raise ApiError(
            422,
            "ambiguous_local_time",
            "This time happened twice on that date (clocks were turned back). Please choose one.",
            {"options": options},
        ) from None
    except NonexistentLocalTime as exc:
        suggested = exc.suggested.local
        raise ApiError(
            422,
            "nonexistent_local_time",
            "This time did not exist on that date (clocks were turned forward).",
            {"suggested_time": f"{suggested:%H:%M}", "suggested_date": suggested.date().isoformat()},
        ) from None
    except BirthDateOutOfRange as exc:
        raise ApiError(
            422,
            "birth_date_out_of_range",
            "Please enter a birth date from 1900 onwards, and not in the future.",
            {"earliest": exc.earliest.isoformat(), "latest": exc.latest.isoformat()},
        ) from None
    except ValueError:
        # Only reachable through bad place data (time zone/coordinates) in the cities table.
        logger.warning("City %s has unusable place data", city.id)
        raise ApiError(422, "invalid_place", "This place cannot be used, please choose another city.") from None


def format_utc_offset(minutes: int) -> str:
    """``UTC+03:00`` / ``UTC−04:00`` (typographic minus, as shown to visitors)."""
    sign = "+" if minutes >= 0 else _MINUS_SIGN
    hours, mins = divmod(abs(minutes), 60)
    return f"UTC{sign}{hours:02d}:{mins:02d}"


def _setting_choice(db: Session, key: str, choices: Any) -> Any:
    value = get_setting(db, key)
    # Settings are validated on write; this only guards against a hand-edited row.
    return value if value in get_args(choices) else DEFAULTS[key]


def _new_order(
    payload: OrderCreate,
    locale: str,
    city: CityOut,
    chart: Chart,
    price: pricing.Quote,
    *,
    access_token_hash: str,
) -> Order:
    chart_input = chart.input
    assert chart_input is not None  # a freshly built chart always carries its input
    return Order(
        id=uuid.uuid4(),
        status=OrderStatus.AWAITING_PAYMENT,
        email=payload.email,
        locale=locale,
        display_name=payload.display_name,
        marketing_opt_in=payload.marketing_opt_in,
        birth_date=payload.birth_date,
        birth_time=payload.birth_time,
        time_fold=chart_input.fold,
        city_id=city.id,
        place_label=city.label,
        latitude=city.latitude,
        longitude=city.longitude,
        timezone=city.timezone,
        birth_utc=datetime.fromisoformat(chart_input.utc_datetime),
        chart=chart.model_dump(mode="json"),
        calc_version=chart.calc_version,
        list_price_cents=price.list_price_cents,
        discount_code_id=price.discount.id if price.discount is not None else None,
        discount_cents=price.discount_cents,
        amount_cents=price.amount_cents,
        currency=price.currency,
        payment_provider=get_settings().payment_provider,
        access_token_hash=access_token_hash,
    )


def _confirm_free_order(db: Session, order: Order) -> str:
    order.payment_provider = payments.FREE_PROVIDER
    db.add(order)
    db.flush()
    outcome = payments.record_synthetic_payment(
        db, order, provider=payments.FREE_PROVIDER, event_id=f"free:{order.id}", raw_type="free.full_discount"
    )
    if outcome != payments.OUTCOME_PAID:  # cannot happen for a brand-new order; never hand out a dead order
        raise RuntimeError(f"free order confirmation returned {outcome!r}")
    return order_page_url(order)


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


def order_page_url(order: Order) -> str:
    return f"{get_settings().site_url.rstrip('/')}/{order.locale}/order/{order.id}"


def start_checkout(provider: PaymentProvider, order: Order) -> CheckoutSession:
    page = order_page_url(order)
    try:
        return provider.create_checkout(order, success_url=f"{page}?paid=1", cancel_url=f"{page}?cancelled=1")
    except PaymentProviderError as exc:
        if exc.configuration:
            logger.error("Payment provider %s is not configured: %s", provider.name, exc)
            raise ApiError(503, "payment_unavailable", "Payments are temporarily unavailable.") from None
        raise ApiError(
            502, "payment_provider_error", "The payment service did not respond, please try again."
        ) from None


def new_checkout(db: Session, order: Order) -> str:
    """A fresh checkout session for an unpaid order (the previous one may have expired)."""
    if order.status != OrderStatus.AWAITING_PAYMENT:
        raise order_not_payable()
    try:
        provider = payments.get_provider(order.payment_provider)
    except ValueError:
        raise order_not_payable() from None
    # No row lock during the provider call: a payment webhook for this order must not wait on it.
    session = start_checkout(provider, order)
    locked = db.scalar(
        select(Order).where(Order.id == order.id).with_for_update().execution_options(populate_existing=True)
    )
    if locked is None or locked.status != OrderStatus.AWAITING_PAYMENT:
        raise order_not_payable()  # paid meanwhile; the unused session simply expires
    locked.provider_session_id = session.id
    db.flush()
    return session.url


def order_not_payable() -> ApiError:
    return ApiError(409, "order_not_payable", "This order is not awaiting payment.")


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


def order_status(db: Session, order: Order) -> OrderStatusOut:
    report = db.scalar(select(Report).where(Report.order_id == order.id))
    return OrderStatusOut(
        order_id=order.id,
        status=order.status,
        locale=order.locale,
        email_masked=mask_email(order.email),
        amount_cents=order.amount_cents,
        currency=order.currency,
        created_at=order.created_at,
        paid_at=order.paid_at,
        ready_at=order.ready_at,
        access_expires_at=report.expires_at if report is not None else None,
        download_available=is_download_available(order, report, utcnow()),
        progress=Progress(sections_done=count_done_sections(db, order.id), sections_total=SECTIONS_TOTAL),
        signs=chart_signs(order.chart),
    )


def is_download_available(order: Order, report: Report | None, now: datetime) -> bool:
    return (
        order.status == OrderStatus.READY
        and report is not None
        and report.deleted_at is None
        and report.expires_at > now
    )


def mask_email(email: str) -> str:
    """``alice@example.com`` -> ``a***@example.com``."""
    local, _, domain = email.rpartition("@")
    if not local or not domain:
        return "***"
    return f"{local[0]}***@{domain}"


def chart_signs(chart: Mapping[str, Any] | None) -> OrderSigns:
    """Signs read straight from the stored chart JSON: works for purged charts (``input`` removed)
    and never fails on a partial chart."""
    return OrderSigns(
        sun=nested_str(chart, "western", "sun", "sign"),
        moon=nested_str(chart, "western", "moon", "sign"),
        ascendant=nested_str(chart, "western", "ascendant", "sign"),
        year_animal=nested_str(chart, "chinese", "year", "animal"),
        month_animal=nested_str(chart, "chinese", "month", "animal"),
        day_animal=nested_str(chart, "chinese", "day", "animal"),
    )


def nested_str(data: Any, *path: str) -> str | None:
    for key in path:
        if not isinstance(data, Mapping):
            return None
        data = data.get(key)
    return data if isinstance(data, str) else None


def birth_time_label(value: time | None) -> str | None:
    return f"{value:%H:%M}" if value is not None else None
