"""Payments API, mounted at ``/api/v1/payments``: the Stripe webhook and the development fake checkout."""

from __future__ import annotations

import logging
import uuid
from typing import Annotated, Final

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError, not_found
from app.orders.service import get_order_for_token
from app.payments import service
from app.payments.providers.base import InvalidWebhook
from app.payments.schemas import FakeCompleteIn, FakeCompleteOut, WebhookReceived

logger = logging.getLogger(__name__)

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]

# Stripe events are a few KB; anything far larger is not a Stripe delivery.
MAX_WEBHOOK_BYTES: Final = 512 * 1024


async def read_webhook_body(request: Request) -> bytes:
    """The raw body, exactly as signed (never re-serialised JSON), with a size cap."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_WEBHOOK_BYTES:
        raise ApiError(413, "payload_too_large", "Webhook payload too large")
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_WEBHOOK_BYTES:
            raise ApiError(413, "payload_too_large", "Webhook payload too large")
        chunks.append(chunk)
    return b"".join(chunks)


def require_fake_payments() -> None:
    if not service.fake_payments_enabled():
        raise not_found()


@router.post("/stripe/webhook", response_model=WebhookReceived)
def stripe_webhook(
    request: Request, db: DbSession, payload: Annotated[bytes, Depends(read_webhook_body)]
) -> WebhookReceived:
    provider = service.get_provider("stripe")
    try:
        events = provider.parse_webhook(payload, request.headers)
    except InvalidWebhook as exc:
        logger.warning("Rejected Stripe webhook: %s", exc.code)
        raise ApiError(400, exc.code, str(exc)) from None
    for event in events:
        outcome = service.process_event(db, provider.name, event)
        logger.info("Stripe event %s (%s) -> %s", event.event_id, event.raw_type, outcome)
    db.commit()
    # Verified events are always acknowledged, even ignored ones, so Stripe stops redelivering them.
    return WebhookReceived()


@router.post("/fake/complete", response_model=FakeCompleteOut, dependencies=[Depends(require_fake_payments)])
def fake_complete(payload: FakeCompleteIn, db: DbSession) -> FakeCompleteOut:
    order = get_order_for_token(db, payload.order_id, payload.access_token)
    outcome = service.record_synthetic_payment(
        db, order, provider="fake", event_id=f"fake:{order.id}:{uuid.uuid4().hex}", raw_type="fake.complete"
    )
    db.commit()
    logger.info("Fake payment for order %s -> %s", order.id, outcome)
    return FakeCompleteOut(status=order.status)
