"""Stripe Checkout (hosted payment page) and Stripe webhook verification/normalisation (stripe SDK v16)."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, Final

import stripe

from app.models import Order
from app.payments.providers.base import (
    CHECKOUT_EXPIRED,
    IGNORED,
    PAYMENT_FAILED,
    PAYMENT_SUCCEEDED,
    PRODUCT_NAME,
    REFUNDED,
    CheckoutSession,
    InvalidWebhook,
    PaymentEventData,
    PaymentEventType,
    PaymentProviderError,
    parse_order_id,
)
from app.utils import utcnow

logger = logging.getLogger(__name__)

# Stripe accepts 30 minutes to 24 hours; an abandoned checkout should not hold a session for a day.
CHECKOUT_LIFETIME: Final = timedelta(hours=2)
MAX_NETWORK_RETRIES: Final = 2

_SESSION_EVENTS: Final[dict[str, PaymentEventType]] = {
    "checkout.session.async_payment_succeeded": PAYMENT_SUCCEEDED,
    "checkout.session.async_payment_failed": PAYMENT_FAILED,
    "checkout.session.expired": CHECKOUT_EXPIRED,
}


class StripeProvider:
    name = "stripe"

    def __init__(self, secret_key: str, webhook_secret: str) -> None:
        self._secret_key = secret_key
        self._webhook_secret = webhook_secret
        self._stripe_client: stripe.StripeClient | None = None

    def create_checkout(self, order: Order, success_url: str, cancel_url: str) -> CheckoutSession:
        if not self._secret_key:
            raise PaymentProviderError("ZB_STRIPE_SECRET_KEY is not configured", configuration=True)
        params = build_session_params(order, success_url, cancel_url, now=utcnow())
        # One key per checkout attempt: the SDK's own network retries reuse it, so a timeout can
        # never create two sessions for the same attempt.
        options: stripe.RequestOptions = {"idempotency_key": f"zb-checkout-{order.id}-{uuid.uuid4().hex}"}
        try:
            session = self._client().v1.checkout.sessions.create(params, options)  # type: ignore[arg-type]
        except stripe.StripeError as exc:
            # The SDK message can echo request parameters (customer e-mail): log only the classification.
            logger.warning(
                "Stripe checkout creation failed for order %s: %s (status %s, code %s)",
                order.id,
                type(exc).__name__,
                exc.http_status,
                exc.code,
            )
            raise PaymentProviderError("Stripe checkout creation failed") from exc
        if not session.id or not session.url:
            raise PaymentProviderError("Stripe returned a checkout session without id or url")
        return CheckoutSession(id=str(session.id), url=str(session.url))

    def parse_webhook(self, payload: bytes, headers: Mapping[str, str]) -> list[PaymentEventData]:
        if not self._webhook_secret:
            logger.error("Stripe webhook received but ZB_STRIPE_WEBHOOK_SECRET is not configured")
            raise InvalidWebhook("invalid_signature", "Webhook signature cannot be verified")
        signature = headers.get("stripe-signature")
        # The same check ``stripe.Webhook.construct_event`` runs (HMAC-SHA256 + 5-minute replay window);
        # parsing is done here because the SDK crashes on signed JSON that is not an object.
        try:
            stripe.WebhookSignature.verify_header(
                payload, signature, self._webhook_secret, stripe.Webhook.DEFAULT_TOLERANCE
            )
        except stripe.SignatureVerificationError as exc:
            raise InvalidWebhook("invalid_signature", "Invalid webhook signature") from exc
        except ValueError as exc:  # body is not UTF-8
            raise InvalidWebhook("invalid_payload", "Invalid webhook payload") from exc
        try:
            event = json.loads(payload)
        except ValueError as exc:
            raise InvalidWebhook("invalid_payload", "Invalid webhook payload") from exc
        if not isinstance(event, dict):
            raise InvalidWebhook("invalid_payload", "Webhook payload is not a Stripe event")
        return [normalize_event(event)]

    def _client(self) -> stripe.StripeClient:
        if self._stripe_client is None:
            self._stripe_client = stripe.StripeClient(self._secret_key, max_network_retries=MAX_NETWORK_RETRIES)
        return self._stripe_client


def build_session_params(order: Order, success_url: str, cancel_url: str, *, now: datetime) -> dict[str, Any]:
    order_ref = str(order.id)
    return {
        "mode": "payment",
        "line_items": [
            {
                "quantity": 1,
                "price_data": {
                    "currency": order.currency.lower(),
                    "unit_amount": order.amount_cents,
                    "product_data": {"name": PRODUCT_NAME},
                },
            }
        ],
        "customer_email": order.email,
        "client_reference_id": order_ref,
        "metadata": {"order_id": order_ref},
        "payment_intent_data": {"metadata": {"order_id": order_ref}},
        "success_url": success_url,
        "cancel_url": cancel_url,
        "expires_at": int((now + CHECKOUT_LIFETIME).timestamp()),
        "locale": "auto",
    }


def normalize_event(event: Mapping[str, Any]) -> PaymentEventData:
    """Map a (verified) Stripe event to :class:`PaymentEventData`; unknown types become ``ignored``."""
    event_id = event.get("id")
    raw_type = event.get("type")
    data = event.get("data")
    obj = data.get("object") if isinstance(data, Mapping) else None
    if not isinstance(event_id, str) or not event_id or not isinstance(raw_type, str) or not isinstance(obj, Mapping):
        raise InvalidWebhook("invalid_payload", "Webhook payload is not a Stripe event")
    if raw_type.startswith("checkout.session."):
        return _session_event(event_id, raw_type, obj)
    if raw_type == "charge.refunded":
        return _refund_event(event_id, raw_type, obj)
    return PaymentEventData(event_id=event_id, type=IGNORED, raw_type=raw_type)


def _session_event(event_id: str, raw_type: str, session: Mapping[str, Any]) -> PaymentEventData:
    if raw_type == "checkout.session.completed":
        # Delayed methods (bank debits) complete the session unpaid; async_payment_succeeded follows.
        event_type: PaymentEventType = PAYMENT_SUCCEEDED if session.get("payment_status") == "paid" else IGNORED
    else:
        event_type = _SESSION_EVENTS.get(raw_type, IGNORED)
    metadata = session.get("metadata")
    order_id = parse_order_id(metadata.get("order_id")) if isinstance(metadata, Mapping) else None
    return PaymentEventData(
        event_id=event_id,
        type=event_type,
        raw_type=raw_type,
        order_id=order_id or parse_order_id(session.get("client_reference_id")),
        provider_session_id=_string(session.get("id")),
        provider_payment_id=_object_id(session.get("payment_intent")),
        amount_cents=_integer(session.get("amount_total")),
        currency=_currency(session.get("currency")),
    )


def _refund_event(event_id: str, raw_type: str, charge: Mapping[str, Any]) -> PaymentEventData:
    # ``refunded`` is true only once the whole amount was refunded; partial refunds keep the report.
    fully_refunded = charge.get("refunded") is True
    metadata = charge.get("metadata")
    return PaymentEventData(
        event_id=event_id,
        type=REFUNDED if fully_refunded else IGNORED,
        raw_type=raw_type,
        order_id=parse_order_id(metadata.get("order_id")) if isinstance(metadata, Mapping) else None,
        provider_payment_id=_object_id(charge.get("payment_intent")),
        amount_cents=_integer(charge.get("amount_refunded")),
        currency=_currency(charge.get("currency")),
    )


def _string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _object_id(value: object) -> str | None:
    """An id field that Stripe may also return expanded as an object."""
    if isinstance(value, Mapping):
        value = value.get("id")
    return _string(value)


def _integer(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _currency(value: object) -> str | None:
    return value.upper() if isinstance(value, str) and value else None
