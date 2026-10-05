"""POST /api/v1/free-reading: signs, readings with locale fallback, lead storage, limits, validation."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select

from app import settings_store
from app.charts import service as chart_service
from app.models import FreeReading, FreeReadingKind, FreeReadingRequest
from app.utils import ip_hash

URL = "/api/v1/free-reading"
SIGN = FreeReadingKind.SIGN
ANIMAL = FreeReadingKind.ANIMAL


def body(**overrides):
    return {"birth_date": "1990-08-17", "email": "visitor@example.com", "locale": "en", **overrides}


@pytest.fixture
def add_reading(db):
    def _add(kind: FreeReadingKind, key: str, locale: str, title: str, text: str) -> None:
        db.add(FreeReading(kind=kind, key=key, locale=locale, title=title, body=text))
        db.commit()

    return _add


@pytest.fixture
def readings(add_reading):
    add_reading(SIGN, "leo", "en", "Leo", "You **shine**.")
    add_reading(SIGN, "leo", "ar", "الأسد", "أنت **تتألق**.")
    add_reading(ANIMAL, "horse", "en", "Horse", "Free *spirit*.")
    add_reading(SIGN, "virgo", "en", "Virgo", "Precise.")
    add_reading(ANIMAL, "goat", "en", "Goat", "Gentle.")


@pytest.fixture
def set_settings(db):
    def _set(**values) -> None:
        settings_store.set_settings(db, values)
        db.commit()

    return _set


def stored_requests(db) -> list[FreeReadingRequest]:
    db.expire_all()
    return list(db.scalars(select(FreeReadingRequest).order_by(FreeReadingRequest.id)))


def request_count(db) -> int:
    db.expire_all()
    return db.scalar(select(func.count()).select_from(FreeReadingRequest))


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_happy_path(client, db, readings):
    response = client.post(URL, json=body())

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "signs": {
            "sun_sign": "leo",
            "sun_sign_alternative": None,
            "year_animal": "horse",
            "year_element": "metal",
            "year_animal_alternative": None,
            "year_boundary": "lichun",
        },
        "sign_reading": {"key": "leo", "title": "Leo", "body_html": "<p>You <strong>shine</strong>.</p>\n"},
        "animal_reading": {"key": "horse", "title": "Horse", "body_html": "<p>Free <em>spirit</em>.</p>\n"},
    }


def test_lead_is_stored_with_normalised_fields(client, db, readings):
    response = client.post(
        URL,
        json=body(email="  Visitor.Name@Example.COM ", locale="ar-EG", marketing_opt_in=True),
        headers={"X-Forwarded-For": "203.0.113.7, 10.0.0.1"},
    )
    assert response.status_code == 200

    [row] = stored_requests(db)
    assert row.email == "visitor.name@example.com"
    assert row.locale == "ar"
    assert row.birth_date == date(1990, 8, 17)
    assert row.sun_sign == "leo"
    assert row.year_animal == "horse"
    assert row.marketing_opt_in is True
    assert row.created_at is not None


def test_raw_ip_is_never_stored(client, db):
    ip = "203.0.113.7"
    assert client.post(URL, json=body(), headers={"X-Forwarded-For": ip}).status_code == 200

    [row] = stored_requests(db)
    assert row.ip_hash == ip_hash(ip)
    assert len(row.ip_hash) == 64
    columns = {column.key: getattr(row, column.key) for column in FreeReadingRequest.__table__.columns}
    assert not any(ip in str(value) for value in columns.values())


def test_marketing_opt_in_defaults_to_false(client, db):
    payload = body()
    payload.pop("locale")
    assert client.post(URL, json=payload).status_code == 200
    [row] = stored_requests(db)
    assert row.marketing_opt_in is False
    assert row.locale == "en"


def test_each_request_is_recorded(client, db):
    for _ in range(3):
        assert client.post(URL, json=body()).status_code == 200
    assert request_count(db) == 3


def test_response_does_not_echo_personal_data(client):
    response = client.post(URL, json=body(email="secret.person@example.com"))
    assert "secret.person" not in response.text
    assert "1990-08-17" not in response.text


# ---------------------------------------------------------------------------
# Readings and locales
# ---------------------------------------------------------------------------


def test_requested_locale_is_used(client, readings):
    data = client.post(URL, json=body(locale="ar")).json()
    assert data["sign_reading"] == {
        "key": "leo",
        "title": "الأسد",
        "body_html": "<p>أنت <strong>تتألق</strong>.</p>\n",
    }


def test_missing_translation_falls_back_to_default_locale(client, readings):
    # The Arabic horse reading does not exist: the English one is served instead.
    data = client.post(URL, json=body(locale="ar")).json()
    assert data["sign_reading"]["title"] == "الأسد"
    assert data["animal_reading"]["title"] == "Horse"


def test_blank_translation_falls_back_to_default_locale(client, add_reading, readings):
    add_reading(ANIMAL, "horse", "ar", "حصان", "   \n ")
    data = client.post(URL, json=body(locale="ar")).json()
    assert data["animal_reading"]["title"] == "Horse"


@pytest.mark.parametrize("locale", ["fr", "", "xx-YY", None, "EN", "en_US"])
def test_unsupported_or_odd_locales_use_the_default(client, db, readings, locale):
    data = client.post(URL, json=body(locale=locale)).json()
    assert data["sign_reading"]["title"] == "Leo"
    assert stored_requests(db)[0].locale == "en"


def test_missing_readings_are_null(client):
    data = client.post(URL, json=body()).json()
    assert data["signs"]["sun_sign"] == "leo"
    assert data["sign_reading"] is None
    assert data["animal_reading"] is None


def test_only_the_matching_readings_are_returned(client, readings):
    # 2003-09-01: Virgo, goat year (癸未) — must not pick up the Leo/horse rows.
    data = client.post(URL, json=body(birth_date="2003-09-01")).json()
    assert data["signs"]["sun_sign"] == "virgo"
    assert data["signs"]["year_animal"] == "goat"
    assert data["sign_reading"]["key"] == "virgo"
    assert data["animal_reading"]["key"] == "goat"


def test_reading_markdown_is_sanitised(client, add_reading):
    add_reading(
        SIGN,
        "leo",
        "en",
        "Leo",
        "<script>alert(1)</script>\n\n[click](javascript:alert(1)) <img src=x onerror=alert(1)>",
    )
    html = client.post(URL, json=body()).json()["sign_reading"]["body_html"]
    assert "<script" not in html
    assert "<img" not in html
    # The javascript: link is not turned into an anchor; it stays as inert, escaped text.
    assert "<a" not in html
    assert "href" not in html


# ---------------------------------------------------------------------------
# Boundary dates
# ---------------------------------------------------------------------------


def test_alternative_sun_sign_on_cusp_date(client):
    signs = client.post(URL, json=body(birth_date="2024-03-20")).json()["signs"]
    assert signs["sun_sign"] == "aries"
    assert signs["sun_sign_alternative"] == "pisces"


def test_alternative_animal_around_lichun(client):
    signs = client.post(URL, json=body(birth_date="2024-02-04")).json()["signs"]
    assert (signs["year_animal"], signs["year_animal_alternative"]) == ("rabbit", "dragon")
    assert signs["year_boundary"] == "lichun"


def test_year_boundary_setting_is_used(client, db, set_settings):
    set_settings(chinese_year_boundary="lunar_new_year")
    signs = client.post(URL, json=body(birth_date="2024-02-09")).json()["signs"]
    assert signs["year_boundary"] == "lunar_new_year"
    assert (signs["year_animal"], signs["year_animal_alternative"]) == ("rabbit", "dragon")
    assert stored_requests(db)[0].year_animal == "rabbit"


def test_earliest_supported_date(client):
    response = client.post(URL, json=body(birth_date="1900-01-01"))
    assert response.status_code == 200
    assert response.json()["signs"]["year_animal"] == "pig"  # before Lichun 1900


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


def test_rate_limit_per_ip(client, db, set_settings):
    set_settings(free_reading_rate_limit_per_hour=2)
    headers = {"X-Forwarded-For": "198.51.100.1"}

    assert client.post(URL, json=body(), headers=headers).status_code == 200
    assert client.post(URL, json=body(), headers=headers).status_code == 200
    blocked = client.post(URL, json=body(), headers=headers)

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert int(blocked.headers["retry-after"]) > 0
    assert request_count(db) == 2

    # Another visitor is not affected.
    assert client.post(URL, json=body(), headers={"X-Forwarded-For": "198.51.100.2"}).status_code == 200


def test_rate_limit_counts_out_of_range_attempts(client, set_settings):
    set_settings(free_reading_rate_limit_per_hour=1)
    assert client.post(URL, json=body(birth_date="1800-01-01")).status_code == 422
    assert client.post(URL, json=body()).status_code == 429


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def assert_validation_error(response, field: str) -> None:
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert field in {f["field"] for f in error["details"]["fields"]}


@pytest.mark.parametrize("birth_date", ["1899-12-31", "1000-01-01", "2999-01-01"])
def test_birth_date_out_of_range(client, db, birth_date):
    response = client.post(URL, json=body(birth_date=birth_date))
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "birth_date_out_of_range"
    assert error["details"]["min_date"] == "1900-01-01"
    assert request_count(db) == 0


def test_tomorrow_is_out_of_range(client, monkeypatch):
    monkeypatch.setattr(chart_service, "utcnow", lambda: datetime(2026, 10, 5, 9, 0, tzinfo=UTC))
    assert client.post(URL, json=body(birth_date="2026-10-05")).status_code == 200
    response = client.post(URL, json=body(birth_date="2026-10-06"))
    assert response.json()["error"]["code"] == "birth_date_out_of_range"
    assert response.json()["error"]["details"]["max_date"] == "2026-10-05"


@pytest.mark.parametrize(
    "birth_date",
    [
        "17/08/1990",
        "1990-8-17",
        "19900817",
        "1990-02-30",
        "1990-08-17T00:00:00",
        "١٩٩٠-٠٨-١٧",
        " 1990-08-17",
        0,
        650000000,
        None,
        "",
        ["1990-08-17"],
    ],
)
def test_invalid_birth_date_format(client, db, birth_date):
    assert_validation_error(client.post(URL, json=body(birth_date=birth_date)), "birth_date")
    assert request_count(db) == 0


@pytest.mark.parametrize(
    "email",
    ["", "not-an-email", "a@b", "@example.com", "visitor@", "a b@example.com", "x" * 250 + "@example.com", 42],
)
def test_invalid_email(client, db, email):
    assert_validation_error(client.post(URL, json=body(email=email)), "email")
    assert request_count(db) == 0


@pytest.mark.parametrize("opt_in", ["yes", "true", 1, None])
def test_marketing_opt_in_must_be_a_boolean(client, opt_in):
    assert_validation_error(client.post(URL, json=body(marketing_opt_in=opt_in)), "marketing_opt_in")


def test_locale_too_long(client):
    assert_validation_error(client.post(URL, json=body(locale="en-" + "x" * 40)), "locale")


@pytest.mark.parametrize("field", ["birth_date", "email"])
def test_required_fields(client, field):
    payload = body()
    payload.pop(field)
    assert_validation_error(client.post(URL, json=payload), field)


def test_non_json_body(client, db):
    response = client.post(URL, content=b"birth_date=1990-08-17", headers={"Content-Type": "text/plain"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert request_count(db) == 0


def test_unknown_fields_are_ignored(client, db):
    response = client.post(URL, json=body(ip_hash="forged", sun_sign="aries", id=999))
    assert response.status_code == 200
    [row] = stored_requests(db)
    assert row.sun_sign == "leo"
    assert row.ip_hash != "forged"
    assert row.id != 999


def test_only_post_is_allowed(client):
    assert client.get(URL).status_code == 405
