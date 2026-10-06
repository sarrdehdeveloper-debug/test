"""Request/response models of the payments API."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models import OrderStatus

MAX_TOKEN_LENGTH = 256


class FakeCompleteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Kept as strings so a malformed id gets the same 404 as a wrong token.
    order_id: Annotated[str, Field(max_length=64)]
    access_token: Annotated[str, Field(min_length=1, max_length=MAX_TOKEN_LENGTH)]


class FakeCompleteOut(BaseModel):
    status: OrderStatus


class WebhookReceived(BaseModel):
    received: bool = True
