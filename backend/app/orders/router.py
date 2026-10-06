"""Public orders API, mounted at ``/api/v1/orders`` (docs/ARCHITECTURE.md §5).

Order pages authenticate with the browser access token (``X-Order-Token``) returned once at creation.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.orders import pricing, service
from app.orders.schemas import CheckoutOut, OrderCreate, OrderCreated, OrderStatusOut, QuoteIn, QuoteOut
from app.utils import client_ip, utcnow

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]
OrderToken = Annotated[str | None, Header(alias="X-Order-Token")]


@router.post("/quote", response_model=QuoteOut)
def quote_order(payload: QuoteIn, request: Request, db: DbSession) -> QuoteOut:
    service.enforce_quote_rate_limit(client_ip(request))
    return pricing.quote(db, payload.discount_code, utcnow()).to_out()


@router.post("", response_model=OrderCreated, status_code=201)
def create_order(payload: OrderCreate, request: Request, db: DbSession) -> OrderCreated:
    created = service.create_order(db, payload, client_ip(request))
    db.commit()
    return created


@router.get("/{order_id}", response_model=OrderStatusOut)
def get_order_status(order_id: str, db: DbSession, x_order_token: OrderToken = None) -> OrderStatusOut:
    order = service.get_order_for_token(db, order_id, x_order_token)
    return service.order_status(db, order)


@router.post("/{order_id}/checkout", response_model=CheckoutOut)
def create_checkout(order_id: str, request: Request, db: DbSession, x_order_token: OrderToken = None) -> CheckoutOut:
    order = service.get_order_for_token(db, order_id, x_order_token)
    service.enforce_order_rate_limit(db, client_ip(request), scope="checkout")
    checkout_url = service.new_checkout(db, order)
    db.commit()
    return CheckoutOut(checkout_url=checkout_url)
