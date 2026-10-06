"""Development payment provider: the checkout is a local page that calls ``POST /payments/fake/complete``."""

from __future__ import annotations

import uuid
from collections.abc import Mapping

from app.config import get_settings
from app.models import Order
from app.payments.providers.base import CheckoutSession, InvalidWebhook, PaymentEventData


class FakeProvider:
    name = "fake"

    def create_checkout(self, order: Order, success_url: str, cancel_url: str) -> CheckoutSession:  # noqa: ARG002
        site_url = get_settings().site_url.rstrip("/")
        return CheckoutSession(
            id=f"fake_cs_{uuid.uuid4().hex}",
            url=f"{site_url}/{order.locale}/checkout/fake?order={order.id}",
        )

    def parse_webhook(self, payload: bytes, headers: Mapping[str, str]) -> list[PaymentEventData]:  # noqa: ARG002
        # Fake payments are confirmed through the token-checked dev endpoint, never by webhook.
        raise InvalidWebhook("invalid_signature", "The fake provider does not accept webhooks")
