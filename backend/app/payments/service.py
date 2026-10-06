"""Payment state machine: confirm payments (idempotently), refunds, and webhook event processing.

Nothing here commits: callers commit once, so the payment event row, the order's state change,
the discount redemption and the ``generate_report`` job are written atomically (transactional outbox).
"""

from __future__ import annotations

import logging
import uuid
from typing import Final

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.jobs.queue import GENERATE_REPORT, enqueue
from app.models import DiscountCode, Order, OrderStatus, PaymentEvent, Report
from app.payments.providers.base import (
    CHECKOUT_EXPIRED,
    PAYMENT_FAILED,
    PAYMENT_SUCCEEDED,
    REFUNDED,
    PaymentEventData,
    PaymentProvider,
)
from app.utils import utcnow

logger = logging.getLogger(__name__)

FREE_PROVIDER: Final = "free"  # orders whose discount covers the whole price

# confirm_payment / process_event outcomes (stored on payment_events.outcome)
OUTCOME_PAID: Final = "paid"
OUTCOME_DUPLICATE: Final = "duplicate"  # order already paid by this payment
OUTCOME_DUPLICATE_PAYMENT: Final = "duplicate_payment"  # a second, different payment: needs a manual refund
OUTCOME_DUPLICATE_EVENT: Final = "duplicate_event"  # same provider event delivered again
OUTCOME_AMOUNT_MISMATCH: Final = "amount_mismatch"
OUTCOME_PROVIDER_MISMATCH: Final = "provider_mismatch"
OUTCOME_ORDER_NOT_FOUND: Final = "order_not_found"
OUTCOME_REFUNDED: Final = "refunded"
OUTCOME_NOT_REFUNDABLE: Final = "not_refundable"
OUTCOME_PAYMENT_FAILED: Final = "payment_failed"
OUTCOME_CHECKOUT_EXPIRED: Final = "checkout_expired"
OUTCOME_IGNORED: Final = "ignored"

# A payment for an abandoned order is still honoured: delayed methods can succeed days later.
PAYABLE_STATUSES: Final = frozenset({OrderStatus.AWAITING_PAYMENT, OrderStatus.ABANDONED})
REFUNDABLE_STATUSES: Final = frozenset(
    {
        OrderStatus.PAID,
        OrderStatus.QUEUED,
        OrderStatus.GENERATING,
        OrderStatus.READY,
        OrderStatus.GENERATION_FAILED,
        OrderStatus.EXPIRED,
    }
)


def generate_report_dedupe_key(order_id: uuid.UUID) -> str:
    return f"generate_report:{order_id}"


def get_provider(name: str | None = None) -> PaymentProvider:
    """The provider for ``name`` (default: the configured ``ZB_PAYMENT_PROVIDER``)."""
    settings = get_settings()
    name = name or settings.payment_provider
    if name == "stripe":
        from app.payments.providers.stripe_provider import StripeProvider

        return StripeProvider(settings.stripe_secret_key, settings.stripe_webhook_secret)
    if name == "fake":
        from app.payments.providers.fake_provider import FakeProvider

        return FakeProvider()
    raise ValueError(f"Unknown payment provider: {name!r}")


def fake_payments_enabled() -> bool:
    settings = get_settings()
    return settings.payment_provider == "fake" and not settings.is_production


# ---------------------------------------------------------------------------
# Payment confirmation
# ---------------------------------------------------------------------------


def confirm_payment(
    db: Session,
    order_id: uuid.UUID,
    *,
    provider: str,
    provider_session_id: str | None,
    provider_payment_id: str | None,
    amount_cents: int | None,
    currency: str | None,
    event_id: str,
) -> str:
    """Mark the order paid and queue its report, exactly once. Returns an ``OUTCOME_*`` value.

    The order row is locked, so concurrent deliveries of the same payment serialise here and the
    later one sees the order already queued. Amount and currency must match the order exactly; a
    success redirect is never proof of payment, only a verified provider event (or the dev endpoint).
    The caller commits.
    """
    order = _lock_order(db, order_id)
    if order is None:
        logger.warning("Payment event %s refers to an unknown order", event_id)
        return OUTCOME_ORDER_NOT_FOUND
    if order.payment_provider != provider:
        logger.warning("Payment event %s (%s) is for order %s of another provider", event_id, provider, order.id)
        return OUTCOME_PROVIDER_MISMATCH
    if order.status not in PAYABLE_STATUSES:
        if provider_payment_id and order.provider_payment_id and provider_payment_id != order.provider_payment_id:
            logger.warning("Order %s was paid twice (event %s): refund the second payment", order.id, event_id)
            return OUTCOME_DUPLICATE_PAYMENT
        return OUTCOME_DUPLICATE
    if amount_cents != order.amount_cents or (currency or "").upper() != order.currency.upper():
        logger.warning("Payment event %s amount/currency does not match order %s; not marked paid", event_id, order.id)
        return OUTCOME_AMOUNT_MISMATCH

    _mark_paid(order, provider_session_id=provider_session_id, provider_payment_id=provider_payment_id)
    _count_redemption(db, order)
    _queue_generation(db, order)
    logger.info("Order %s paid (event %s); report generation queued", order.id, event_id)
    return OUTCOME_PAID


def _lock_order(db: Session, order_id: uuid.UUID) -> Order | None:
    return db.scalar(
        select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True)
    )


def _mark_paid(order: Order, *, provider_session_id: str | None, provider_payment_id: str | None) -> None:
    order.status = OrderStatus.PAID
    order.paid_at = utcnow()
    order.provider_payment_id = provider_payment_id
    if provider_session_id:
        # The visitor may have paid an older checkout session than the one stored last.
        order.provider_session_id = provider_session_id


def _count_redemption(db: Session, order: Order) -> None:
    if order.discount_code_id is None:
        return
    # Atomic increment (row lock held until commit). A code that ran out between checkout and payment
    # is still honoured: the customer has paid.
    db.execute(
        update(DiscountCode)
        .where(DiscountCode.id == order.discount_code_id)
        .values(redemptions_count=DiscountCode.redemptions_count + 1)
    )


def _queue_generation(db: Session, order: Order) -> None:
    # paid -> queued in the same transaction as the job insert, so a paid order can never lose its job.
    order.status = OrderStatus.QUEUED
    enqueue(db, GENERATE_REPORT, {"order_id": str(order.id)}, dedupe_key=generate_report_dedupe_key(order.id))


# ---------------------------------------------------------------------------
# Refunds
# ---------------------------------------------------------------------------


def refund_order(db: Session, order_id: uuid.UUID, *, event_id: str) -> str:
    """Mark the order refunded and revoke report access immediately (cleanup deletes the file)."""
    order = _lock_order(db, order_id)
    if order is None:
        return OUTCOME_ORDER_NOT_FOUND
    if order.status == OrderStatus.REFUNDED:
        return OUTCOME_DUPLICATE
    if order.status not in REFUNDABLE_STATUSES:
        logger.warning("Refund event %s for order %s in status %s", event_id, order.id, order.status.value)
        return OUTCOME_NOT_REFUNDABLE
    order.status = OrderStatus.REFUNDED
    report = db.scalar(select(Report).where(Report.order_id == order.id).with_for_update())
    if report is not None:
        now = utcnow()
        report.expires_at = min(report.expires_at, now)
        report.email_token_hash = None
    logger.info("Order %s refunded (event %s); report access revoked", order.id, event_id)
    return OUTCOME_REFUNDED


# ---------------------------------------------------------------------------
# Provider events
# ---------------------------------------------------------------------------


def process_event(db: Session, provider: str, event: PaymentEventData) -> str:
    """Record ``event`` once per ``(provider, event_id)`` and apply it. Returns the outcome; caller commits.

    A redelivered event is not processed again (``duplicate_event``). Recording and applying share the
    caller's transaction, so an error rolls both back and the provider's retry is processed normally.
    """
    order_id = _resolve_order_id(db, event)
    if order_id is not None:
        # Lock the order before inserting the event row: the row's foreign key takes a KEY SHARE lock
        # on the order, and two concurrent deliveries would deadlock upgrading it to FOR UPDATE.
        _lock_order(db, order_id)
    row_id = db.execute(
        insert(PaymentEvent)
        .values(
            provider=provider,
            event_id=event.event_id[:255],
            event_type=event.raw_type[:100],
            order_id=order_id,
            data=event.summary(),
            outcome="received",
            received_at=utcnow(),
        )
        .on_conflict_do_nothing(constraint="uq_payment_event")
        .returning(PaymentEvent.id)
    ).scalar_one_or_none()
    if row_id is None:
        return OUTCOME_DUPLICATE_EVENT

    outcome = _apply_event(db, provider, event, order_id)
    db.execute(update(PaymentEvent).where(PaymentEvent.id == row_id).values(outcome=outcome))
    return outcome


def _apply_event(db: Session, provider: str, event: PaymentEventData, order_id: uuid.UUID | None) -> str:
    if event.type == PAYMENT_SUCCEEDED:
        if order_id is None:
            logger.warning("Payment event %s has no known order", event.event_id)
            return OUTCOME_ORDER_NOT_FOUND
        return confirm_payment(
            db,
            order_id,
            provider=provider,
            provider_session_id=event.provider_session_id,
            provider_payment_id=event.provider_payment_id,
            amount_cents=event.amount_cents,
            currency=event.currency,
            event_id=event.event_id,
        )
    if event.type == REFUNDED:
        if order_id is None:
            logger.warning("Refund event %s has no known order", event.event_id)
            return OUTCOME_ORDER_NOT_FOUND
        return refund_order(db, order_id, event_id=event.event_id)
    if event.type == PAYMENT_FAILED:
        # The order stays payable: the visitor can start a new checkout from the order page.
        logger.info("Payment failed for order %s (event %s)", order_id, event.event_id)
        return OUTCOME_PAYMENT_FAILED
    if event.type == CHECKOUT_EXPIRED:
        return OUTCOME_CHECKOUT_EXPIRED
    return OUTCOME_IGNORED


def _resolve_order_id(db: Session, event: PaymentEventData) -> uuid.UUID | None:
    """The existing order the event belongs to: metadata id, then checkout session, then payment id.

    Unknown ids resolve to ``None`` (events from other integrations on the same Stripe account).
    """
    if event.order_id is not None and db.get(Order, event.order_id) is not None:
        return event.order_id
    if event.provider_session_id:
        found = db.scalar(select(Order.id).where(Order.provider_session_id == event.provider_session_id))
        if found is not None:
            return found
    if event.provider_payment_id:
        return db.scalar(
            select(Order.id).where(Order.provider_payment_id == event.provider_payment_id).order_by(Order.created_at)
        )
    return None


def record_synthetic_payment(db: Session, order: Order, *, provider: str, event_id: str, raw_type: str) -> str:
    """Confirm a payment that has no provider webhook (free orders, the fake provider). Caller commits."""
    event = PaymentEventData(
        event_id=event_id,
        type=PAYMENT_SUCCEEDED,
        raw_type=raw_type,
        order_id=order.id,
        provider_session_id=order.provider_session_id,
        provider_payment_id=f"{provider}_{order.id.hex}",
        amount_cents=order.amount_cents,
        currency=order.currency,
    )
    return process_event(db, provider, event)
