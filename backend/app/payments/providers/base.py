"""Payment provider abstraction: checkout sessions and normalised webhook events.

Providers translate their own objects into :class:`PaymentEventData`, so the payment state machine
in :mod:`app.payments.service` never sees provider-specific payloads.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Literal, Protocol

from app.models import Order

PaymentEventType = Literal["payment_succeeded", "payment_failed", "refunded", "checkout_expired", "ignored"]

PAYMENT_SUCCEEDED: Final = "payment_succeeded"
PAYMENT_FAILED: Final = "payment_failed"
REFUNDED: Final = "refunded"
CHECKOUT_EXPIRED: Final = "checkout_expired"
IGNORED: Final = "ignored"

PRODUCT_NAME: Final = "Zodiac Blend — Personal Blend Report"


@dataclass(frozen=True, slots=True)
class CheckoutSession:
    id: str
    url: str


@dataclass(frozen=True, slots=True)
class PaymentEventData:
    """A provider event reduced to what the order flow needs (never card or customer details)."""

    event_id: str
    type: PaymentEventType
    raw_type: str
    order_id: uuid.UUID | None = None
    provider_session_id: str | None = None
    provider_payment_id: str | None = None
    amount_cents: int | None = None
    currency: str | None = None  # upper-case ISO 4217

    def summary(self) -> dict[str, object]:
        """Minimal JSON-safe record stored on ``payment_events.data``."""
        return {
            "raw_type": self.raw_type,
            "provider_session_id": self.provider_session_id,
            "provider_payment_id": self.provider_payment_id,
            "amount_cents": self.amount_cents,
            "currency": self.currency,
        }


class InvalidWebhook(Exception):
    """The webhook could not be authenticated or parsed; answer 400 so nothing is processed."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code  # "invalid_signature" | "invalid_payload"


class PaymentProviderError(Exception):
    """Creating a checkout failed (network, provider outage, configuration)."""

    def __init__(self, message: str, *, configuration: bool = False) -> None:
        super().__init__(message)
        self.configuration = configuration


class PaymentProvider(Protocol):
    name: str

    def create_checkout(self, order: Order, success_url: str, cancel_url: str) -> CheckoutSession:
        """Start a hosted checkout for ``order.amount_cents`` ``order.currency``."""
        ...

    def parse_webhook(self, payload: bytes, headers: Mapping[str, str]) -> list[PaymentEventData]:
        """Verify and normalise a webhook body. Raises :class:`InvalidWebhook`."""
        ...


def parse_order_id(value: object) -> uuid.UUID | None:
    """Order id from provider metadata; anything that is not a UUID is ignored."""
    if not isinstance(value, str):
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None
