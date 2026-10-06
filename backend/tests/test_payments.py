"""Payments: fake checkout completion, Stripe Checkout creation, signed Stripe webhooks, refunds, idempotency."""

from __future__ import annotations

import hashlib
import hmac
import json
import threading
import time
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
import stripe
from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import DiscountCode, DiscountKind, Job, Order, OrderStatus, PaymentEvent, Report
from app.payments import service
from app.payments.providers import stripe_provider
from app.payments.providers.base import PaymentEventData
from app.payments.providers.stripe_provider import StripeProvider, normalize_event
from app.utils import utcnow

ORDERS = "/api/v1/orders"
FAKE_COMPLETE = "/api/v1/payments/fake/complete"
WEBHOOK = "/api/v1/payments/stripe/webhook"
WEBHOOK_SECRET = "whsec_test_secret"
CAIRO = 360630


def order_body(**overrides):
    return {
        "email": "alice@example.com",
        "locale": "en",
        "birth_date": "1990-08-17",
        "birth_time": "14:30",
        "city_id": CAIRO,
        "accept_terms": True,
        **overrides,
    }


class FakeCheckoutSessions:
    def __init__(self) -> None:
        self.calls: list[tuple[dict, dict]] = []
        self.error: Exception | None = None

    def create(self, params, options):
        if self.error is not None:
            raise self.error
        self.calls.append((params, options))
        number = len(self.calls)
        return SimpleNamespace(id=f"cs_test_{number}", url=f"https://checkout.stripe.com/c/pay/cs_test_{number}")


@pytest.fixture
def stripe_api(monkeypatch) -> FakeCheckoutSessions:
    """Stripe configured, with the Checkout API call replaced by a recorder."""
    settings = get_settings()
    monkeypatch.setattr(settings, "payment_provider", "stripe")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_123")
    monkeypatch.setattr(settings, "stripe_webhook_secret", WEBHOOK_SECRET)
    sessions = FakeCheckoutSessions()
    fake_client = SimpleNamespace(v1=SimpleNamespace(checkout=SimpleNamespace(sessions=sessions)))
    monkeypatch.setattr(StripeProvider, "_client", lambda self: fake_client)
    return sessions


@pytest.fixture
def create_order(client, sample_geo):
    def _create(**overrides) -> dict:
        response = client.post(ORDERS, json=order_body(**overrides))
        assert response.status_code == 201, response.text
        return response.json()

    return _create


def load_order(db, order_id) -> Order:
    db.expire_all()
    return db.get(Order, uuid.UUID(str(order_id)))


def jobs(db) -> list[Job]:
    db.expire_all()
    return list(db.scalars(select(Job).order_by(Job.id)))


def events(db) -> list[PaymentEvent]:
    db.expire_all()
    return list(db.scalars(select(PaymentEvent).order_by(PaymentEvent.id)))


def fake_complete(client, created: dict):
    return client.post(FAKE_COMPLETE, json={"order_id": created["order_id"], "access_token": created["access_token"]})


def sign(payload: bytes, secret: str = WEBHOOK_SECRET, timestamp: int | None = None) -> str:
    timestamp = int(time.time()) if timestamp is None else timestamp
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def post_event(client, event: dict, *, secret: str = WEBHOOK_SECRET, timestamp: int | None = None):
    payload = json.dumps(event).encode()
    return client.post(
        WEBHOOK,
        content=payload,
        headers={"Stripe-Signature": sign(payload, secret, timestamp), "Content-Type": "application/json"},
    )


def session_event(
    order_id: str,
    *,
    event_id: str = "evt_1",
    event_type: str = "checkout.session.completed",
    session_id: str = "cs_test_1",
    payment_status: str = "paid",
    amount: int = 2900,
    currency: str = "usd",
    payment_intent: object = "pi_123",
    metadata: dict | None = None,
) -> dict:
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "created": int(time.time()),
        "livemode": False,
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "amount_total": amount,
                "currency": currency,
                "client_reference_id": order_id,
                "metadata": {"order_id": order_id} if metadata is None else metadata,
                "payment_intent": payment_intent,
                "payment_status": payment_status,
                "customer_details": {"email": "alice@example.com", "name": "Alice Doe"},
            }
        },
    }


def refund_event(*, event_id: str = "evt_refund", payment_intent: str = "pi_123", refunded: bool = True) -> dict:
    return {
        "id": event_id,
        "object": "event",
        "type": "charge.refunded",
        "data": {
            "object": {
                "id": "ch_1",
                "object": "charge",
                "amount": 2900,
                "amount_refunded": 2900 if refunded else 1000,
                "currency": "usd",
                "payment_intent": payment_intent,
                "refunded": refunded,
                "metadata": {},
            }
        },
    }


# ---------------------------------------------------------------------------
# Fake provider (development)
# ---------------------------------------------------------------------------


def test_fake_complete_queues_exactly_one_job(client, db, create_order):
    created = create_order()

    response = fake_complete(client, created)

    assert response.status_code == 200
    assert response.json() == {"status": "queued"}
    order = load_order(db, created["order_id"])
    assert order.status == OrderStatus.QUEUED
    assert order.paid_at is not None
    assert order.provider_payment_id == f"fake_{order.id.hex}"
    [job] = jobs(db)
    assert job.kind == "generate_report"
    assert job.dedupe_key == f"generate_report:{created['order_id']}"
    assert job.payload == {"order_id": created["order_id"]}
    [event] = events(db)
    assert (event.provider, event.event_type, event.outcome, event.order_id) == (
        "fake",
        "fake.complete",
        "paid",
        order.id,
    )


def test_duplicate_fake_complete_creates_no_second_job(client, db, create_order):
    created = create_order()

    first = fake_complete(client, created)
    paid_at = load_order(db, created["order_id"]).paid_at
    second = fake_complete(client, created)

    assert first.json() == second.json() == {"status": "queued"}
    assert len(jobs(db)) == 1
    assert [e.outcome for e in events(db)] == ["paid", "duplicate"]
    assert load_order(db, created["order_id"]).paid_at == paid_at


def test_discount_redemption_is_counted_once(client, db, create_order):
    discount = DiscountCode(code="SAVE10", kind=DiscountKind.PERCENT, value=10)
    db.add(discount)
    db.commit()
    created = create_order(discount_code="SAVE10")

    fake_complete(client, created)
    fake_complete(client, created)

    db.expire_all()
    assert db.get(DiscountCode, discount.id).redemptions_count == 1


def test_fake_complete_checks_the_token(client, db, create_order):
    created = create_order()

    wrong = client.post(FAKE_COMPLETE, json={"order_id": created["order_id"], "access_token": "wrong"})
    unknown = client.post(FAKE_COMPLETE, json={"order_id": str(uuid.uuid4()), "access_token": created["access_token"]})
    malformed = client.post(FAKE_COMPLETE, json={"order_id": "1 OR 1=1", "access_token": created["access_token"]})

    assert wrong.status_code == unknown.status_code == malformed.status_code == 404
    assert wrong.text == unknown.text == malformed.text
    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT
    assert jobs(db) == []


def test_fake_complete_is_disabled_with_stripe(client, db, create_order, monkeypatch):
    created = create_order()
    monkeypatch.setattr(get_settings(), "payment_provider", "stripe")

    response = fake_complete(client, created)

    assert response.status_code == 404
    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT


def test_fake_complete_is_disabled_in_production(client, db, create_order, monkeypatch):
    created = create_order()
    monkeypatch.setattr(get_settings(), "env", "production")

    response = fake_complete(client, created)

    assert response.status_code == 404
    assert jobs(db) == []


def test_fake_complete_cannot_pay_a_stripe_order(client, db, create_order, stripe_api, monkeypatch):
    created = create_order()
    monkeypatch.setattr(get_settings(), "payment_provider", "fake")

    response = fake_complete(client, created)

    assert response.json() == {"status": "awaiting_payment"}
    assert [e.outcome for e in events(db)] == ["provider_mismatch"]
    assert jobs(db) == []


def test_order_status_after_fake_payment(client, create_order):
    created = create_order()
    fake_complete(client, created)

    body = client.get(f"{ORDERS}/{created['order_id']}", headers={"X-Order-Token": created["access_token"]}).json()

    assert body["status"] == "queued"
    assert body["paid_at"] is not None


# ---------------------------------------------------------------------------
# Stripe Checkout creation
# ---------------------------------------------------------------------------


def test_stripe_checkout_session_parameters(client, db, create_order, stripe_api):
    before = int(time.time())

    created = create_order(email="Alice@Example.com", locale="ar")

    order_id = created["order_id"]
    assert created["checkout_url"] == "https://checkout.stripe.com/c/pay/cs_test_1"
    [(params, options)] = stripe_api.calls
    expires_at = params.pop("expires_at")
    assert before + 2 * 3600 - 5 <= expires_at <= int(time.time()) + 2 * 3600
    assert params == {
        "mode": "payment",
        "line_items": [
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": 2900,
                    "product_data": {"name": "Zodiac Blend — Personal Blend Report"},
                },
            }
        ],
        "customer_email": "alice@example.com",
        "client_reference_id": order_id,
        "metadata": {"order_id": order_id},
        "payment_intent_data": {"metadata": {"order_id": order_id}},
        "success_url": f"http://testserver/ar/order/{order_id}?paid=1",
        "cancel_url": f"http://testserver/ar/order/{order_id}?cancelled=1",
        "locale": "auto",
    }
    assert options["idempotency_key"].startswith(f"zb-checkout-{order_id}-")
    order = load_order(db, order_id)
    assert order.payment_provider == "stripe"
    assert order.provider_session_id == "cs_test_1"


def test_stripe_checkout_uses_discounted_amount(client, db, create_order, stripe_api):
    db.add(DiscountCode(code="SAVE10", kind=DiscountKind.PERCENT, value=10))
    db.commit()

    create_order(discount_code="SAVE10")

    assert stripe_api.calls[0][0]["line_items"][0]["price_data"]["unit_amount"] == 2610


def test_each_checkout_attempt_gets_its_own_idempotency_key(client, create_order, stripe_api):
    created = create_order()

    response = client.post(
        f"{ORDERS}/{created['order_id']}/checkout", headers={"X-Order-Token": created["access_token"]}
    )

    assert response.json() == {"checkout_url": "https://checkout.stripe.com/c/pay/cs_test_2"}
    keys = [options["idempotency_key"] for _, options in stripe_api.calls]
    assert len(set(keys)) == 2


def test_stripe_api_error_is_502_and_stores_nothing(client, db, sample_geo, stripe_api):
    stripe_api.error = stripe.APIConnectionError("network down")

    response = client.post(ORDERS, json=order_body())

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "payment_provider_error"
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Order)) == 0


def test_real_stripe_client_is_built_lazily_with_retries():
    provider = StripeProvider("sk_test_abc", WEBHOOK_SECRET)
    client = provider._client()
    assert isinstance(client, stripe.StripeClient)
    assert provider._client() is client


# ---------------------------------------------------------------------------
# Stripe webhooks
# ---------------------------------------------------------------------------


def test_signed_checkout_completed_marks_the_order_paid(client, db, create_order, stripe_api):
    created = create_order()

    response = post_event(client, session_event(created["order_id"]))

    assert response.status_code == 200
    assert response.json() == {"received": True}
    order = load_order(db, created["order_id"])
    assert order.status == OrderStatus.QUEUED
    assert order.provider_payment_id == "pi_123"
    assert order.paid_at is not None
    [job] = jobs(db)
    assert job.dedupe_key == f"generate_report:{created['order_id']}"
    [event] = events(db)
    assert (event.provider, event.event_id, event.event_type, event.outcome) == (
        "stripe",
        "evt_1",
        "checkout.session.completed",
        "paid",
    )
    assert event.order_id == order.id
    # Only a minimal summary is kept: no customer details.
    assert "alice" not in json.dumps(event.data).lower()
    assert event.data["amount_cents"] == 2900
    assert event.data["currency"] == "USD"


def test_duplicate_event_is_not_processed_twice(client, db, create_order, stripe_api):
    created = create_order()
    event = session_event(created["order_id"])

    first = post_event(client, event)
    second = post_event(client, event)

    assert first.status_code == second.status_code == 200
    assert len(events(db)) == 1
    assert len(jobs(db)) == 1


def test_second_success_event_for_a_paid_order_is_a_duplicate(client, db, create_order, stripe_api):
    created = create_order()
    post_event(client, session_event(created["order_id"]))

    post_event(
        client,
        session_event(created["order_id"], event_id="evt_2", event_type="checkout.session.async_payment_succeeded"),
    )
    post_event(client, session_event(created["order_id"], event_id="evt_3", payment_intent="pi_other"))

    assert [e.outcome for e in events(db)] == ["paid", "duplicate", "duplicate_payment"]
    assert len(jobs(db)) == 1
    assert load_order(db, created["order_id"]).provider_payment_id == "pi_123"


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Stripe-Signature": ""},
        {"Stripe-Signature": "garbage"},
        {"Stripe-Signature": "t=123"},
        {"Stripe-Signature": "t=abc,v1=def"},
    ],
)
def test_missing_or_malformed_signature_is_400(client, db, create_order, stripe_api, headers):
    created = create_order()

    response = client.post(WEBHOOK, content=json.dumps(session_event(created["order_id"])).encode(), headers=headers)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_signature"
    assert events(db) == []
    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT


def test_wrong_secret_is_400(client, db, create_order, stripe_api):
    created = create_order()

    response = post_event(client, session_event(created["order_id"]), secret="whsec_attacker")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_signature"
    assert jobs(db) == []


def test_tampered_payload_is_400(client, db, create_order, stripe_api):
    created = create_order()
    payload = json.dumps(session_event(created["order_id"], amount=1)).encode()
    signature = sign(payload)
    tampered = payload.replace(b'"amount_total": 1', b'"amount_total": 2900')

    response = client.post(WEBHOOK, content=tampered, headers={"Stripe-Signature": signature})

    assert response.status_code == 400
    assert events(db) == []


def test_replayed_old_event_is_400(client, db, create_order, stripe_api):
    created = create_order()

    response = post_event(client, session_event(created["order_id"]), timestamp=int(time.time()) - 3600)

    assert response.status_code == 400
    assert jobs(db) == []


def test_webhook_without_configured_secret_is_400(client, db, create_order, stripe_api, monkeypatch):
    created = create_order()
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "")

    response = post_event(client, session_event(created["order_id"]))

    assert response.status_code == 400
    assert events(db) == []


@pytest.mark.parametrize("payload", [b"not json", b"\xff\xfe", b'{"object": "event"}', b"[]"])
def test_signed_but_invalid_payload_is_400(client, db, stripe_api, payload):
    response = client.post(WEBHOOK, content=payload, headers={"Stripe-Signature": sign(payload)})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_payload"
    assert events(db) == []


def test_oversized_webhook_is_rejected(client, stripe_api):
    payload = b"x" * (512 * 1024 + 1)
    response = client.post(WEBHOOK, content=payload, headers={"Stripe-Signature": sign(payload)})
    assert response.status_code == 413


@pytest.mark.parametrize(("amount", "currency"), [(100, "usd"), (2900, "eur"), (2901, "usd")])
def test_amount_or_currency_mismatch_is_not_paid(client, db, create_order, stripe_api, amount, currency):
    created = create_order()

    response = post_event(client, session_event(created["order_id"], amount=amount, currency=currency))

    assert response.status_code == 200
    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT
    assert [e.outcome for e in events(db)] == ["amount_mismatch"]
    assert jobs(db) == []


def test_unpaid_completed_session_waits_for_async_success(client, db, create_order, stripe_api):
    created = create_order()

    post_event(client, session_event(created["order_id"], payment_status="unpaid"))
    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT

    post_event(
        client,
        session_event(created["order_id"], event_id="evt_2", event_type="checkout.session.async_payment_succeeded"),
    )

    assert load_order(db, created["order_id"]).status == OrderStatus.QUEUED
    assert [e.outcome for e in events(db)] == ["ignored", "paid"]
    assert len(jobs(db)) == 1


@pytest.mark.parametrize(
    ("event_type", "outcome"),
    [
        ("checkout.session.async_payment_failed", "payment_failed"),
        ("checkout.session.expired", "checkout_expired"),
        ("customer.created", "ignored"),
        ("payment_intent.succeeded", "ignored"),
    ],
)
def test_non_payment_events_are_acknowledged(client, db, create_order, stripe_api, event_type, outcome):
    created = create_order()

    response = post_event(client, session_event(created["order_id"], event_type=event_type, payment_status="unpaid"))

    assert response.status_code == 200
    assert [e.outcome for e in events(db)] == [outcome]
    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT
    assert jobs(db) == []


def test_event_for_an_unknown_order_is_acknowledged(client, db, stripe_api):
    unknown = str(uuid.uuid4())

    response = post_event(client, session_event(unknown, session_id="cs_elsewhere"))

    assert response.status_code == 200
    [event] = events(db)
    assert event.order_id is None
    assert event.outcome == "order_not_found"


def test_order_found_by_session_id_without_metadata(client, db, create_order, stripe_api):
    created = create_order()
    event = session_event("", metadata={}, session_id="cs_test_1")
    event["data"]["object"]["client_reference_id"] = None

    post_event(client, event)

    assert load_order(db, created["order_id"]).status == OrderStatus.QUEUED


def test_payment_for_abandoned_order_is_honoured(client, db, create_order, stripe_api):
    created = create_order()
    order = load_order(db, created["order_id"])
    order.status = OrderStatus.ABANDONED
    db.commit()

    post_event(client, session_event(created["order_id"]))

    assert load_order(db, created["order_id"]).status == OrderStatus.QUEUED


def test_stripe_event_cannot_pay_a_fake_order(client, db, create_order, stripe_api, monkeypatch):
    monkeypatch.setattr(get_settings(), "payment_provider", "fake")
    created = create_order()
    monkeypatch.setattr(get_settings(), "payment_provider", "stripe")

    post_event(client, session_event(created["order_id"]))

    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT
    assert [e.outcome for e in events(db)] == ["provider_mismatch"]


# ---------------------------------------------------------------------------
# Refunds
# ---------------------------------------------------------------------------


def add_report(db, order_id: str) -> Report:
    order = load_order(db, order_id)
    order.status = OrderStatus.READY
    order.ready_at = utcnow()
    report = Report(
        order_id=order.id,
        file_key="b" * 64,
        size_bytes=1,
        sha256="0" * 64,
        expires_at=utcnow() + timedelta(hours=24),
        email_token_hash="c" * 64,
    )
    db.add(report)
    db.commit()
    return report


def test_full_refund_revokes_access(client, db, create_order, stripe_api):
    created = create_order()
    post_event(client, session_event(created["order_id"]))
    report = add_report(db, created["order_id"])

    response = post_event(client, refund_event())

    assert response.status_code == 200
    order = load_order(db, created["order_id"])
    assert order.status == OrderStatus.REFUNDED
    db.refresh(report)
    assert report.expires_at <= utcnow()
    assert report.email_token_hash is None
    assert events(db)[-1].outcome == "refunded"
    assert events(db)[-1].order_id == order.id
    status = client.get(f"{ORDERS}/{created['order_id']}", headers={"X-Order-Token": created["access_token"]}).json()
    assert status["status"] == "refunded"
    assert status["download_available"] is False


def test_refund_while_generating_stops_the_order(client, db, create_order, stripe_api):
    created = create_order()
    post_event(client, session_event(created["order_id"]))

    post_event(client, refund_event())
    post_event(client, refund_event(event_id="evt_refund_again"))

    assert load_order(db, created["order_id"]).status == OrderStatus.REFUNDED
    assert [e.outcome for e in events(db)] == ["paid", "refunded", "duplicate"]


def test_partial_refund_keeps_the_report(client, db, create_order, stripe_api):
    created = create_order()
    post_event(client, session_event(created["order_id"]))
    add_report(db, created["order_id"])

    post_event(client, refund_event(refunded=False))

    assert load_order(db, created["order_id"]).status == OrderStatus.READY
    assert events(db)[-1].outcome == "ignored"


def test_refund_of_an_unknown_payment(client, db, stripe_api):
    post_event(client, refund_event(payment_intent="pi_unknown"))

    [event] = events(db)
    assert event.outcome == "order_not_found"


def test_refund_of_an_unpaid_order_is_not_applied(db, create_order):
    created = create_order()

    outcome = service.refund_order(db, uuid.UUID(created["order_id"]), event_id="evt_x")
    db.commit()

    assert outcome == "not_refundable"
    assert load_order(db, created["order_id"]).status == OrderStatus.AWAITING_PAYMENT


# ---------------------------------------------------------------------------
# Service level
# ---------------------------------------------------------------------------


def test_confirm_payment_unknown_order(db):
    outcome = service.confirm_payment(
        db,
        uuid.uuid4(),
        provider="fake",
        provider_session_id=None,
        provider_payment_id=None,
        amount_cents=100,
        currency="USD",
        event_id="evt",
    )
    assert outcome == "order_not_found"


def test_confirm_payment_currency_is_case_insensitive(db, create_order):
    created = create_order()

    outcome = service.confirm_payment(
        db,
        uuid.UUID(created["order_id"]),
        provider="fake",
        provider_session_id=None,
        provider_payment_id="pay_1",
        amount_cents=2900,
        currency="usd",
        event_id="evt",
    )
    db.commit()

    assert outcome == "paid"
    assert len(jobs(db)) == 1


def test_concurrent_confirmations_queue_one_job(create_order, db):
    created = create_order()
    order_id = uuid.UUID(created["order_id"])
    outcomes: list[str] = []
    barrier = threading.Barrier(4)

    def confirm(n: int) -> None:
        session = SessionLocal()
        try:
            barrier.wait()
            outcome = service.process_event(
                session,
                "fake",
                PaymentEventData(
                    event_id=f"evt_{n}",
                    type="payment_succeeded",
                    raw_type="test",
                    order_id=order_id,
                    provider_payment_id="pay_1",
                    amount_cents=2900,
                    currency="USD",
                ),
            )
            session.commit()
            outcomes.append(outcome)
        finally:
            session.close()

    threads = [threading.Thread(target=confirm, args=(n,)) for n in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(outcomes) == ["duplicate", "duplicate", "duplicate", "paid"]
    assert len(jobs(db)) == 1


def test_get_provider():
    assert service.get_provider("fake").name == "fake"
    assert service.get_provider("stripe").name == "stripe"
    with pytest.raises(ValueError, match="Unknown payment provider"):
        service.get_provider("paypal")


# ---------------------------------------------------------------------------
# Stripe event normalisation
# ---------------------------------------------------------------------------


def test_normalize_completed_session_with_expanded_payment_intent():
    order_id = str(uuid.uuid4())
    event = session_event(order_id, payment_intent={"id": "pi_expanded", "object": "payment_intent"})

    data = normalize_event(event)

    assert data == PaymentEventData(
        event_id="evt_1",
        type="payment_succeeded",
        raw_type="checkout.session.completed",
        order_id=uuid.UUID(order_id),
        provider_session_id="cs_test_1",
        provider_payment_id="pi_expanded",
        amount_cents=2900,
        currency="USD",
    )


def test_normalize_falls_back_to_client_reference_id():
    order_id = str(uuid.uuid4())
    event = session_event(order_id, metadata={"order_id": "not-a-uuid"})

    assert normalize_event(event).order_id == uuid.UUID(order_id)


def test_normalize_ignores_bad_field_types():
    event = session_event("x", amount="2900", currency=None, payment_intent=123, metadata={"order_id": 5})

    data = normalize_event(event)

    assert data.order_id is None
    assert data.amount_cents is None
    assert data.currency is None
    assert data.provider_payment_id is None


def test_normalize_refund():
    data = normalize_event(refund_event())
    assert (data.type, data.provider_payment_id, data.amount_cents, data.currency) == (
        "refunded",
        "pi_123",
        2900,
        "USD",
    )
    assert normalize_event(refund_event(refunded=False)).type == "ignored"


def test_checkout_lifetime_is_within_stripe_limits():
    assert timedelta(minutes=30) <= stripe_provider.CHECKOUT_LIFETIME <= timedelta(hours=24)
