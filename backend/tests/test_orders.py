"""Public orders API: quote & discounts, order creation (chart, time ambiguity, limits), status, checkout."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app import settings_store
from app.config import get_settings
from app.models import (
    DiscountCode,
    DiscountKind,
    Job,
    Order,
    OrderStatus,
    PaymentEvent,
    Report,
    ReportSection,
    SectionStatus,
)
from app.orders import pricing
from app.orders.schemas import clean_display_name
from app.payments.providers.base import PaymentProviderError
from app.payments.providers.fake_provider import FakeProvider
from app.security import hash_token
from app.utils import utcnow

ORDERS = "/api/v1/orders"
QUOTE = f"{ORDERS}/quote"
CAIRO = 360630
NEW_YORK = 5128581


def order_body(**overrides):
    return {
        "email": "Alice@Example.com",
        "locale": "en",
        "display_name": None,
        "birth_date": "1990-08-17",
        "birth_time": "14:30",
        "city_id": CAIRO,
        "time_fold": None,
        "discount_code": None,
        "marketing_opt_in": False,
        "accept_terms": True,
        **overrides,
    }


@pytest.fixture
def add_discount(db):
    def _add(
        code: str = "SAVE10", kind: DiscountKind = DiscountKind.PERCENT, value: int = 10, **fields
    ) -> DiscountCode:
        discount = DiscountCode(code=code, kind=kind, value=value, **fields)
        db.add(discount)
        db.commit()
        return discount

    return _add


@pytest.fixture
def set_settings(db):
    def _set(**values) -> None:
        settings_store.set_settings(db, values)
        db.commit()

    return _set


@pytest.fixture
def create_order(client, sample_geo):
    def _create(**overrides) -> dict:
        response = client.post(ORDERS, json=order_body(**overrides))
        assert response.status_code == 201, response.text
        return response.json()

    return _create


def load_order(db, order_id: str) -> Order:
    db.expire_all()
    order = db.get(Order, uuid.UUID(order_id))
    assert order is not None
    return order


def count(db, model, *conditions) -> int:
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model).where(*conditions))


def error(response) -> dict:
    return response.json()["error"]


# ---------------------------------------------------------------------------
# Quote & discount codes
# ---------------------------------------------------------------------------


def test_quote_without_code_uses_price_settings(client):
    response = client.post(QUOTE, json={"discount_code": None})

    assert response.status_code == 200
    assert response.json() == {
        "list_price_cents": 2900,
        "discount_cents": 0,
        "amount_cents": 2900,
        "currency": "USD",
        "discount": None,
    }


def test_quote_follows_dashboard_price_and_currency(client, set_settings):
    set_settings(paid_price_cents=4500, currency="eur")

    body = client.post(QUOTE, json={}).json()

    assert body["list_price_cents"] == 4500
    assert body["amount_cents"] == 4500
    assert body["currency"] == "EUR"


def test_quote_with_percent_code(client, add_discount):
    add_discount("SAVE10", DiscountKind.PERCENT, 10)

    response = client.post(QUOTE, json={"discount_code": "SAVE10"})

    assert response.status_code == 200
    assert response.json() == {
        "list_price_cents": 2900,
        "discount_cents": 290,
        "amount_cents": 2610,
        "currency": "USD",
        "discount": {"code": "SAVE10", "kind": "percent", "value": 10},
    }


def test_quote_code_is_case_and_space_insensitive(client, add_discount):
    add_discount("SAVE10")

    body = client.post(QUOTE, json={"discount_code": "  save10 "}).json()

    assert body["discount"]["code"] == "SAVE10"
    assert body["amount_cents"] == 2610


def test_blank_code_means_no_discount(client):
    body = client.post(QUOTE, json={"discount_code": "   "}).json()
    assert body["discount"] is None
    assert body["amount_cents"] == 2900


@pytest.mark.parametrize(
    ("price", "percent", "expected_discount"),
    [
        (2990, 15, 449),  # 448.5 rounds half up
        (2999, 15, 450),  # 449.85
        (2900, 33, 957),
        (2900, 100, 2900),
        (99, 1, 1),  # 0.99
        (149, 1, 1),  # 1.49
        (150, 1, 2),  # 1.50 rounds half up
    ],
)
def test_percent_rounds_half_up(client, add_discount, set_settings, price, percent, expected_discount):
    set_settings(paid_price_cents=price)
    add_discount("PCT", DiscountKind.PERCENT, percent)

    body = client.post(QUOTE, json={"discount_code": "PCT"}).json()

    assert body["discount_cents"] == expected_discount
    assert body["amount_cents"] == price - expected_discount


def test_fixed_code_is_capped_at_the_price(client, add_discount):
    add_discount("FIVE", DiscountKind.FIXED, 500, currency="USD")
    add_discount("HUGE", DiscountKind.FIXED, 10_000, currency="USD")

    assert client.post(QUOTE, json={"discount_code": "FIVE"}).json()["amount_cents"] == 2400
    huge = client.post(QUOTE, json={"discount_code": "HUGE"}).json()
    assert huge["discount_cents"] == 2900
    assert huge["amount_cents"] == 0


@pytest.mark.parametrize(
    ("fields", "reason"),
    [
        ({"is_active": False}, "inactive"),
        ({"starts_at": datetime(2999, 1, 1, tzinfo=UTC)}, "not_started"),
        ({"ends_at": datetime(2000, 1, 1, tzinfo=UTC)}, "expired"),
        ({"max_redemptions": 3, "redemptions_count": 3}, "exhausted"),
        ({"kind": DiscountKind.FIXED, "value": 300, "currency": "EUR"}, "currency_mismatch"),
    ],
)
def test_quote_rejects_unusable_codes(client, add_discount, fields, reason):
    values = {"code": "CODE1", "kind": DiscountKind.PERCENT, "value": 10, **fields}
    add_discount(**values)

    response = client.post(QUOTE, json={"discount_code": "code1"})

    assert response.status_code == 422
    assert error(response)["code"] == "invalid_discount_code"
    assert error(response)["details"] == {"reason": reason}


def test_quote_unknown_code(client):
    response = client.post(QUOTE, json={"discount_code": "NOPE"})

    assert response.status_code == 422
    assert error(response)["details"] == {"reason": "not_found"}


def test_code_valid_inside_its_window(client, add_discount):
    now = utcnow()
    add_discount(
        "WINDOW",
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
        max_redemptions=5,
        redemptions_count=4,
    )

    assert client.post(QUOTE, json={"discount_code": "WINDOW"}).status_code == 200


def test_rejection_boundaries(add_discount):
    now = datetime(2026, 1, 1, 12, tzinfo=UTC)
    starts = add_discount("STARTS", starts_at=now)
    ends = add_discount("ENDS", ends_at=now)

    assert pricing.rejection_reason(starts, "USD", now) is None
    assert pricing.rejection_reason(ends, "USD", now) == "expired"


def test_quote_code_too_long_is_validation_error(client):
    response = client.post(QUOTE, json={"discount_code": "X" * 65})
    assert response.status_code == 422
    assert error(response)["code"] == "validation_error"


def test_quote_is_rate_limited(client):
    for _ in range(60):
        assert client.post(QUOTE, json={}).status_code == 200
    response = client.post(QUOTE, json={})
    assert response.status_code == 429
    assert error(response)["code"] == "rate_limited"


# ---------------------------------------------------------------------------
# Order creation
# ---------------------------------------------------------------------------


def test_create_order_happy_path(client, db, sample_geo):
    response = client.post(ORDERS, json=order_body(display_name="Alice", marketing_opt_in=True))

    assert response.status_code == 201
    body = response.json()
    order_id = body["order_id"]
    assert body["status"] == "awaiting_payment"
    assert body["amount_cents"] == 2900
    assert body["currency"] == "USD"
    assert body["checkout_url"] == f"http://testserver/en/checkout/fake?order={order_id}"
    assert len(body["access_token"]) >= 40
    assert response.headers["cache-control"] == "no-store"

    order = load_order(db, order_id)
    assert order.status == OrderStatus.AWAITING_PAYMENT
    assert order.email == "alice@example.com"
    assert order.locale == "en"
    assert order.display_name == "Alice"
    assert order.marketing_opt_in is True
    assert order.birth_date == date(1990, 8, 17)
    assert order.birth_time.strftime("%H:%M") == "14:30"
    assert order.city_id == CAIRO
    assert order.place_label == "Cairo, Egypt"
    assert order.timezone == "Africa/Cairo"
    assert order.latitude == pytest.approx(30.06263)
    assert order.payment_provider == "fake"
    assert order.provider_session_id.startswith("fake_cs_")
    assert order.paid_at is None
    assert order.list_price_cents == 2900
    assert order.discount_cents == 0
    assert order.discount_code_id is None
    # Egypt observed summer time (UTC+3) in August 1990.
    assert order.birth_utc == datetime(1990, 8, 17, 11, 30, tzinfo=UTC)
    assert order.time_fold == 0
    assert order.calc_version == order.chart["calc_version"]
    assert order.chart["input"]["place_label"] == "Cairo, Egypt"
    assert order.chart["western"]["sun"]["sign"] == "leo"
    assert order.chart["chinese"]["year"]["animal"] == "horse"
    # Only the hash of the access token is stored.
    assert order.access_token_hash == hash_token(body["access_token"])
    assert body["access_token"] not in str(order.__dict__)
    # Nothing is queued before payment.
    assert count(db, Job) == 0


def test_create_order_in_arabic(client, db, sample_geo):
    body = client.post(ORDERS, json=order_body(locale="ar-EG")).json()

    order = load_order(db, body["order_id"])
    assert order.locale == "ar"
    assert order.place_label == "القاهرة، مصر"
    assert body["checkout_url"].startswith("http://testserver/ar/checkout/fake?order=")


def test_unsupported_locale_falls_back_to_default(create_order, db):
    body = create_order(locale="fr")
    assert load_order(db, body["order_id"]).locale == "en"


def test_us_city_uses_new_york_time(create_order, db):
    body = create_order(city_id=NEW_YORK, birth_date="2000-01-15", birth_time="09:00")

    order = load_order(db, body["order_id"])
    assert order.birth_utc == datetime(2000, 1, 15, 14, 0, tzinfo=UTC)
    assert order.place_label == "New York City, United States"


@pytest.mark.parametrize(
    ("raw", "cleaned"),
    [
        ("  Alice  ", "Alice"),
        ("Alice\n\nSmith", "Alice Smith"),
        ("Alice\t \r\nB.", "Alice B."),
        ("A\u0000li\u0007ce", "Alice"),
        ("‮ecilA", "ecilA"),  # bidi override removed
        ("Ali​ce", "Alice"),  # zero-width space removed
        ("می‌خواهم", "می‌خواهم"),  # zero-width non-joiner is part of the spelling
        ("ليلى", "ليلى"),
        ("   ", None),
        ("\n\t", None),
    ],
)
def test_display_name_cleaning(raw, cleaned):
    assert clean_display_name(raw) == cleaned


def test_display_name_is_cleaned_on_create(create_order, db):
    body = create_order(display_name="  Ali\nce ‮  Smith\t")
    assert load_order(db, body["order_id"]).display_name == "Ali ce Smith"


def test_blank_display_name_is_stored_as_null(create_order, db):
    body = create_order(display_name="  \n ")
    assert load_order(db, body["order_id"]).display_name is None


def test_display_name_length_limit(client, db, sample_geo):
    ok = client.post(ORDERS, json=order_body(display_name="a" * 80))
    too_long = client.post(ORDERS, json=order_body(display_name="a" * 81))
    # Whitespace collapses before the length check.
    collapsed = client.post(ORDERS, json=order_body(display_name="a" + " " * 200 + "b"))

    assert ok.status_code == 201
    assert too_long.status_code == 422
    assert error(too_long)["details"]["fields"][0]["field"] == "display_name"
    assert collapsed.status_code == 201
    assert load_order(db, collapsed.json()["order_id"]).display_name == "a b"


def test_ambiguous_time_asks_for_fold_then_succeeds(client, db, sample_geo):
    # 2021-11-07 01:30 happened twice in New York (EDT, then EST).
    body = order_body(city_id=NEW_YORK, birth_date="2021-11-07", birth_time="01:30")

    first = client.post(ORDERS, json=body)

    assert first.status_code == 422
    assert error(first)["code"] == "ambiguous_local_time"
    assert error(first)["details"] == {
        "options": [
            {"fold": 0, "utc_offset_minutes": -240, "label": "01:30 (UTC−04:00)"},
            {"fold": 1, "utc_offset_minutes": -300, "label": "01:30 (UTC−05:00)"},
        ]
    }
    assert count(db, Order) == 0

    second = client.post(ORDERS, json={**body, "time_fold": 1})

    assert second.status_code == 201
    order = load_order(db, second.json()["order_id"])
    assert order.time_fold == 1
    assert order.birth_utc == datetime(2021, 11, 7, 6, 30, tzinfo=UTC)
    assert "ambiguous_time_resolved" in order.chart["warnings"]


def test_fold_zero_picks_the_earlier_instant(create_order, db):
    body = create_order(city_id=NEW_YORK, birth_date="2021-11-07", birth_time="01:30", time_fold=0)
    assert load_order(db, body["order_id"]).birth_utc == datetime(2021, 11, 7, 5, 30, tzinfo=UTC)


def test_fold_is_ignored_for_unambiguous_times(create_order, db):
    body = create_order(time_fold=1)
    assert load_order(db, body["order_id"]).time_fold == 0


def test_nonexistent_time_suggests_a_valid_one(client, db, sample_geo):
    # Clocks jumped from 02:00 to 03:00 in New York on 2021-03-14.
    response = client.post(ORDERS, json=order_body(city_id=NEW_YORK, birth_date="2021-03-14", birth_time="02:30"))

    assert response.status_code == 422
    assert error(response)["code"] == "nonexistent_local_time"
    assert error(response)["details"]["suggested_time"] == "03:30"
    assert error(response)["details"]["suggested_date"] == "2021-03-14"
    assert count(db, Order) == 0


@pytest.mark.parametrize("birth_date", ["1899-12-31", "1066-10-14"])
def test_birth_date_before_1900_is_rejected(client, sample_geo, birth_date):
    response = client.post(ORDERS, json=order_body(birth_date=birth_date))

    assert response.status_code == 422
    assert error(response)["code"] == "birth_date_out_of_range"
    assert error(response)["details"]["earliest"] == "1900-01-01"
    assert date.fromisoformat(error(response)["details"]["latest"]) >= utcnow().date()


def test_future_birth_date_is_rejected(client, sample_geo):
    future = (utcnow() + timedelta(days=3)).date().isoformat()
    response = client.post(ORDERS, json=order_body(birth_date=future))

    assert response.status_code == 422
    assert error(response)["code"] == "birth_date_out_of_range"


def test_earliest_supported_date_is_accepted(create_order):
    create_order(birth_date="1900-01-01", birth_time="12:00")


@pytest.mark.parametrize("accept_terms", [False, None])
def test_terms_must_be_accepted(client, db, sample_geo, accept_terms):
    body = order_body()
    if accept_terms is None:
        del body["accept_terms"]
    else:
        body["accept_terms"] = accept_terms

    response = client.post(ORDERS, json=body)

    assert response.status_code == 422
    assert error(response)["code"] == "terms_not_accepted"
    assert count(db, Order) == 0


def test_terms_flag_must_be_a_real_boolean(client, sample_geo):
    response = client.post(ORDERS, json=order_body(accept_terms="true"))
    assert response.status_code == 422
    assert error(response)["code"] == "validation_error"


def test_unknown_city_is_404(client, db, sample_geo):
    response = client.post(ORDERS, json=order_body(city_id=999_999_999))

    assert response.status_code == 404
    assert error(response)["code"] == "not_found"
    assert count(db, Order) == 0


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("birth_time", "24:00"),
        ("birth_time", "7:05"),
        ("birth_time", "14:30:00"),
        ("birth_time", "١٤:٣٠"),
        ("birth_time", 1430),
        ("birth_time", None),
        ("birth_date", "17/08/1990"),
        ("birth_date", 0),
        ("birth_date", "1990-02-30"),
        ("email", "not-an-email"),
        ("email", "a" * 250 + "@example.com"),
        ("city_id", 0),
        ("city_id", 2**63),
        ("city_id", "360630"),
        ("city_id", None),
        ("time_fold", 2),
        ("time_fold", True),
        ("marketing_opt_in", "yes"),
        ("locale", "x" * 36),
    ],
)
def test_invalid_input_is_a_validation_error(client, sample_geo, field, value):
    response = client.post(ORDERS, json=order_body(**{field: value}))

    assert response.status_code == 422
    assert error(response)["code"] == "validation_error"
    assert error(response)["details"]["fields"][0]["field"].startswith(field)


def test_valid_time_edges(create_order, db):
    midnight = create_order(birth_time="00:00")
    last_minute = create_order(birth_time="23:59", birth_date="1990-08-16")
    assert load_order(db, midnight["order_id"]).birth_time.strftime("%H:%M") == "00:00"
    assert load_order(db, last_minute["order_id"]).birth_time.strftime("%H:%M") == "23:59"


def test_create_order_is_rate_limited_per_ip(client, db, sample_geo, set_settings):
    set_settings(order_rate_limit_per_hour=2)

    assert client.post(ORDERS, json=order_body()).status_code == 201
    assert client.post(ORDERS, json=order_body()).status_code == 201
    limited = client.post(ORDERS, json=order_body())
    other_ip = client.post(ORDERS, json=order_body(), headers={"X-Forwarded-For": "203.0.113.9"})

    assert limited.status_code == 429
    assert error(limited)["code"] == "rate_limited"
    assert "retry-after" in limited.headers
    assert other_ip.status_code == 201
    assert count(db, Order) == 3


def test_order_with_discount_records_the_code_but_counts_it_only_when_paid(create_order, db, add_discount):
    discount = add_discount("SAVE10")

    body = create_order(discount_code="save10")

    assert body["amount_cents"] == 2610
    order = load_order(db, body["order_id"])
    assert order.discount_code_id == discount.id
    assert order.discount_cents == 290
    assert order.list_price_cents == 2900
    assert order.amount_cents == 2610
    assert db.get(DiscountCode, discount.id).redemptions_count == 0


def test_invalid_discount_blocks_the_order(client, db, sample_geo, add_discount):
    add_discount("OLD", ends_at=datetime(2001, 1, 1, tzinfo=UTC))

    response = client.post(ORDERS, json=order_body(discount_code="OLD"))

    assert response.status_code == 422
    assert error(response) == {
        "code": "invalid_discount_code",
        "message": "This discount code has expired.",
        "details": {"reason": "expired"},
    }
    assert count(db, Order) == 0


@pytest.mark.parametrize(
    "discount",
    [
        {"code": "FREE100", "kind": DiscountKind.PERCENT, "value": 100},
        {"code": "GIFT", "kind": DiscountKind.FIXED, "value": 5000, "currency": "USD"},
    ],
)
def test_fully_discounted_order_is_queued_without_checkout(client, db, sample_geo, add_discount, discount):
    code = add_discount(**discount)

    response = client.post(ORDERS, json=order_body(discount_code=discount["code"]))

    assert response.status_code == 201
    body = response.json()
    order_id = body["order_id"]
    assert body["status"] == "queued"
    assert body["amount_cents"] == 0
    assert body["checkout_url"] == f"http://testserver/en/order/{order_id}"

    order = load_order(db, order_id)
    assert order.status == OrderStatus.QUEUED
    assert order.payment_provider == "free"
    assert order.provider_session_id is None
    assert order.paid_at is not None
    jobs = db.scalars(select(Job)).all()
    assert [(j.kind, j.dedupe_key, j.payload) for j in jobs] == [
        ("generate_report", f"generate_report:{order_id}", {"order_id": order_id})
    ]
    event = db.scalar(select(PaymentEvent))
    assert (event.provider, event.event_id, event.outcome) == ("free", f"free:{order_id}", "paid")
    assert db.get(DiscountCode, code.id).redemptions_count == 1


def test_last_redemption_of_a_free_code(client, db, sample_geo, add_discount):
    add_discount("ONCE", DiscountKind.PERCENT, 100, max_redemptions=1)

    first = client.post(ORDERS, json=order_body(discount_code="ONCE"))
    second = client.post(ORDERS, json=order_body(discount_code="ONCE"))

    assert first.status_code == 201
    assert second.status_code == 422
    assert error(second)["details"] == {"reason": "exhausted"}


def test_provider_failure_stores_nothing(client, db, sample_geo, monkeypatch):
    def _fail(self, order, success_url, cancel_url):
        raise PaymentProviderError("down")

    monkeypatch.setattr(FakeProvider, "create_checkout", _fail)

    response = client.post(ORDERS, json=order_body())

    assert response.status_code == 502
    assert error(response)["code"] == "payment_provider_error"
    assert count(db, Order) == 0


def test_unconfigured_stripe_is_503(client, db, sample_geo, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "payment_provider", "stripe")
    monkeypatch.setattr(settings, "stripe_secret_key", "")

    response = client.post(ORDERS, json=order_body())

    assert response.status_code == 503
    assert error(response)["code"] == "payment_unavailable"
    assert count(db, Order) == 0


def test_fake_provider_refuses_orders_in_production(client, db, sample_geo, monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "production")

    response = client.post(ORDERS, json=order_body())

    assert response.status_code == 503
    assert error(response)["code"] == "payment_unavailable"
    assert count(db, Order) == 0


# ---------------------------------------------------------------------------
# Order status
# ---------------------------------------------------------------------------


def get_status(client, order_id: str, token: str | None):
    headers = {"X-Order-Token": token} if token is not None else {}
    return client.get(f"{ORDERS}/{order_id}", headers=headers)


def test_status_with_token(client, create_order):
    created = create_order()

    response = get_status(client, created["order_id"], created["access_token"])

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["order_id"] == created["order_id"]
    assert body["status"] == "awaiting_payment"
    assert body["locale"] == "en"
    assert body["email_masked"] == "a***@example.com"
    assert body["amount_cents"] == 2900
    assert body["currency"] == "USD"
    assert body["created_at"]
    assert body["paid_at"] is None
    assert body["ready_at"] is None
    assert body["access_expires_at"] is None
    assert body["download_available"] is False
    assert body["progress"] == {"sections_done": 0, "sections_total": 6}
    assert body["signs"] == {
        "sun": "leo",
        "moon": "cancer",
        "ascendant": "sagittarius",
        "year_animal": "horse",
        "month_animal": "monkey",
        "day_animal": "tiger",
    }
    # Never echo personal data beyond the masked e-mail.
    assert "alice@example.com" not in response.text
    assert "1990-08-17" not in response.text


def test_status_not_found_responses_are_identical(client, create_order):
    created = create_order()
    other = create_order(email="bob@example.com")
    order_id = created["order_id"]

    responses = [
        get_status(client, order_id, None),
        get_status(client, order_id, ""),
        get_status(client, order_id, "wrong-token"),
        get_status(client, order_id, other["access_token"]),
        get_status(client, order_id, created["access_token"] + "x"),
        get_status(client, order_id, "a" * 5000),
        get_status(client, str(uuid.uuid4()), created["access_token"]),
        get_status(client, "not-a-uuid", created["access_token"]),
        get_status(client, order_id.upper()[:-1], created["access_token"]),
    ]

    assert {r.status_code for r in responses} == {404}
    assert {r.text for r in responses} == {responses[0].text}
    assert responses[0].json()["error"]["code"] == "not_found"


def test_status_accepts_uppercase_uuid(client, create_order):
    created = create_order()
    response = get_status(client, created["order_id"].upper(), created["access_token"])
    assert response.status_code == 200


@pytest.mark.parametrize(
    ("email", "masked"),
    [
        ("alice@example.com", "a***@example.com"),
        ("x@y.io", "x***@y.io"),
        ("a.b+c@sub.example.org", "a***@sub.example.org"),
    ],
)
def test_email_masking(client, create_order, email, masked):
    created = create_order(email=email)
    assert get_status(client, created["order_id"], created["access_token"]).json()["email_masked"] == masked


def test_status_progress_counts_finished_sections(client, db, create_order):
    created = create_order()
    order_id = uuid.UUID(created["order_id"])
    db.add_all(
        [
            ReportSection(order_id=order_id, slot=1, status=SectionStatus.DONE, content="x", word_count=1),
            ReportSection(order_id=order_id, slot=2, status=SectionStatus.DONE, content="x", word_count=1),
            ReportSection(order_id=order_id, slot=3, status=SectionStatus.FAILED),
            ReportSection(order_id=order_id, slot=4, status=SectionStatus.PENDING),
        ]
    )
    db.commit()

    body = get_status(client, created["order_id"], created["access_token"]).json()

    assert body["progress"] == {"sections_done": 2, "sections_total": 6}


def make_ready(db, order_id: str, *, expires_in: timedelta, deleted: bool = False) -> Report:
    order = load_order(db, order_id)
    now = utcnow()
    order.status = OrderStatus.READY
    order.paid_at = now - timedelta(minutes=5)
    order.ready_at = now
    report = Report(
        order_id=order.id,
        file_key="a" * 64,
        size_bytes=10,
        sha256="0" * 64,
        expires_at=now + expires_in,
        deleted_at=now if deleted else None,
    )
    db.add(report)
    db.commit()
    return report


def test_ready_order_offers_the_download(client, db, create_order):
    created = create_order()
    report = make_ready(db, created["order_id"], expires_in=timedelta(hours=24))

    body = get_status(client, created["order_id"], created["access_token"]).json()

    assert body["status"] == "ready"
    assert body["download_available"] is True
    assert body["ready_at"] is not None
    assert datetime.fromisoformat(body["access_expires_at"]) == report.expires_at


@pytest.mark.parametrize(("expires_in", "deleted"), [(timedelta(seconds=-1), False), (timedelta(hours=5), True)])
def test_expired_or_deleted_report_is_not_downloadable(client, db, create_order, expires_in, deleted):
    created = create_order()
    make_ready(db, created["order_id"], expires_in=expires_in, deleted=deleted)

    body = get_status(client, created["order_id"], created["access_token"]).json()

    assert body["download_available"] is False
    assert body["access_expires_at"] is not None


@pytest.mark.parametrize("purged_input", [None, {}])
def test_signs_survive_the_personal_data_purge(client, db, create_order, purged_input):
    created = create_order()
    order = load_order(db, created["order_id"])
    order.chart = {**order.chart, "input": purged_input}
    order.birth_date = None
    order.birth_time = None
    db.commit()

    body = get_status(client, created["order_id"], created["access_token"]).json()

    assert body["signs"]["sun"] == "leo"
    assert body["signs"]["day_animal"] == "tiger"


def test_signs_of_a_broken_chart_are_null(client, db, create_order):
    created = create_order()
    order = load_order(db, created["order_id"])
    order.chart = {"western": "garbage"}
    db.commit()

    body = get_status(client, created["order_id"], created["access_token"]).json()

    assert body["signs"] == {k: None for k in ("sun", "moon", "ascendant", "year_animal", "month_animal", "day_animal")}


# ---------------------------------------------------------------------------
# New checkout for an unpaid order
# ---------------------------------------------------------------------------


def test_new_checkout_session(client, db, create_order):
    created = create_order()
    first_session = load_order(db, created["order_id"]).provider_session_id

    response = client.post(
        f"{ORDERS}/{created['order_id']}/checkout", headers={"X-Order-Token": created["access_token"]}
    )

    assert response.status_code == 200
    assert response.json() == {"checkout_url": f"http://testserver/en/checkout/fake?order={created['order_id']}"}
    second_session = load_order(db, created["order_id"]).provider_session_id
    assert second_session != first_session
    assert second_session.startswith("fake_cs_")


def test_checkout_needs_the_token(client, create_order):
    created = create_order()
    url = f"{ORDERS}/{created['order_id']}/checkout"

    assert client.post(url).status_code == 404
    assert client.post(url, headers={"X-Order-Token": "nope"}).status_code == 404
    assert client.post(f"{ORDERS}/{uuid.uuid4()}/checkout", headers={"X-Order-Token": "nope"}).status_code == 404


def test_no_checkout_once_paid(client, db, create_order):
    created = create_order()
    paid = client.post(
        "/api/v1/payments/fake/complete",
        json={"order_id": created["order_id"], "access_token": created["access_token"]},
    )
    assert paid.json() == {"status": "queued"}

    response = client.post(
        f"{ORDERS}/{created['order_id']}/checkout", headers={"X-Order-Token": created["access_token"]}
    )

    assert response.status_code == 409
    assert error(response)["code"] == "order_not_payable"


def test_checkout_is_rate_limited(client, create_order, set_settings):
    created = create_order()
    set_settings(order_rate_limit_per_hour=1)
    url = f"{ORDERS}/{created['order_id']}/checkout"
    headers = {"X-Order-Token": created["access_token"]}

    assert client.post(url, headers=headers).status_code == 200
    assert client.post(url, headers=headers).status_code == 429


def test_checkout_failure_keeps_the_previous_session(client, db, create_order, monkeypatch):
    created = create_order()
    before = load_order(db, created["order_id"]).provider_session_id

    def _fail(self, order, success_url, cancel_url):
        raise PaymentProviderError("down")

    monkeypatch.setattr(FakeProvider, "create_checkout", _fail)
    response = client.post(
        f"{ORDERS}/{created['order_id']}/checkout", headers={"X-Order-Token": created["access_token"]}
    )

    assert response.status_code == 502
    assert load_order(db, created["order_id"]).provider_session_id == before
