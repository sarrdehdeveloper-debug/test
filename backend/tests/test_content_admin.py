"""Tests for the content admin API (/api/v1/admin): site content, free readings, offers, discounts,
library, blog, markdown preview and business settings."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select

from app.charts.schemas import CHINESE_ANIMALS, WESTERN_SIGNS
from app.content.keys import SITE_CONTENT_KEYS
from app.models import (
    AuditLog,
    BlogPost,
    Book,
    BookSeries,
    DiscountCode,
    DiscountKind,
    FreeReading,
    FreeReadingKind,
    Offer,
    Order,
    PostStatus,
    SiteContent,
)
from app.settings_store import DEFAULTS
from app.utils import utcnow

ADMIN = "/api/v1/admin"
PUBLIC = "/api/v1"
KEY_A, KEY_B = SITE_CONTENT_KEYS[0].key, SITE_CONTENT_KEYS[1].key
MARKDOWN_KEY = next(k.key for k in SITE_CONTENT_KEYS if k.format == "markdown")


def audit_entries(db, action: str | None = None) -> list[AuditLog]:
    db.expire_all()
    stmt = select(AuditLog).order_by(AuditLog.id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    return list(db.scalars(stmt))


def error_fields(response) -> list[str]:
    return [f["field"] for f in response.json()["error"]["details"].get("fields", [])]


@pytest.fixture
def editor(admin_client):
    return admin_client("editor")


@pytest.fixture
def manager(admin_client):
    return admin_client("admin")


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

EDITOR_GETS = ["/site-content", "/free-readings", "/offers", "/book-series", "/blog-posts", "/media"]
MANAGER_GETS = ["/discounts", "/settings"]


@pytest.mark.parametrize("path", EDITOR_GETS + MANAGER_GETS)
def test_unauthenticated_requests_get_401(client, path):
    r = client.get(f"{ADMIN}{path}")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", "/offers", {"slug": "x1", "translations": {"en": {"title": "T"}}}),
        ("put", "/site-content", {"locale": "en", "items": {}}),
        ("post", "/blog-posts", {"slug": "x1", "translations": {"en": {"title": "T"}}}),
        ("post", "/markdown/preview", {"markdown": "x"}),
        ("delete", "/offers/1", None),
    ],
)
def test_mutations_need_the_admin_header(editor, db, method, path, body):
    del editor.headers["X-ZB-Admin"]
    r = editor.request(method.upper(), f"{ADMIN}{path}", json=body)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"
    assert db.scalar(select(Offer)) is None and db.scalar(select(BlogPost)) is None


@pytest.mark.parametrize("path", EDITOR_GETS)
def test_editors_can_read_content(editor, path):
    assert editor.get(f"{ADMIN}{path}").status_code == 200


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/discounts", None),
        ("post", "/discounts", {"code": "NOPE", "kind": "percent", "value": 10}),
        ("get", "/discounts/1", None),
        ("patch", "/discounts/1", {"value": 5}),
        ("delete", "/discounts/1", None),
        ("get", "/settings", None),
        ("put", "/settings", {"values": {"paid_price_cents": 100}}),
    ],
)
def test_editors_cannot_touch_discounts_or_settings(editor, db, method, path, body):
    r = editor.request(method.upper(), f"{ADMIN}{path}", json=body)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"
    assert db.scalar(select(DiscountCode)) is None


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_managers_can_read_discounts_and_settings(admin_client, role):
    c = admin_client(role)
    assert c.get(f"{ADMIN}/discounts").status_code == 200
    assert c.get(f"{ADMIN}/settings").status_code == 200


# ---------------------------------------------------------------------------
# Site content
# ---------------------------------------------------------------------------


def test_site_content_get_lists_keys_and_exact_locale_values(editor, db):
    db.add_all([SiteContent(key=KEY_A, locale="en", value="Hello"), SiteContent(key=KEY_B, locale="ar", value="أهلا")])
    db.commit()
    body = editor.get(f"{ADMIN}/site-content", params={"locale": "ar"}).json()
    assert body["locale"] == "ar"
    assert body["items"][KEY_A] == ""  # no fallback: editors see what is missing
    assert body["items"][KEY_B] == "أهلا"
    assert len(body["items"]) == len(SITE_CONTENT_KEYS)
    assert body["keys"][0] == {
        "key": SITE_CONTENT_KEYS[0].key,
        "format": SITE_CONTENT_KEYS[0].format,
        "group": SITE_CONTENT_KEYS[0].group,
        "description": SITE_CONTENT_KEYS[0].description,
    }
    assert [k["key"] for k in body["keys"]] == [k.key for k in SITE_CONTENT_KEYS]
    assert editor.get(f"{ADMIN}/site-content").json()["locale"] == "en"


def test_site_content_get_rejects_unsupported_locale(editor):
    assert editor.get(f"{ADMIN}/site-content", params={"locale": "fr"}).status_code == 422


def test_site_content_put_upserts_and_audits(editor, db, client):
    db.add(SiteContent(key=KEY_A, locale="en", value="Old"))
    db.commit()
    r = editor.put(f"{ADMIN}/site-content", json={"locale": "en", "items": {KEY_A: "  New  ", KEY_B: "Added"}})
    assert r.status_code == 200
    assert r.json()["items"][KEY_A] == "New"
    assert r.json()["items"][KEY_B] == "Added"
    public = client.get(f"{PUBLIC}/site-content", params={"locale": "en"}).json()["items"]
    assert public[KEY_A] == "New"
    [entry] = audit_entries(db, "site_content.update")
    assert entry.entity_type == "site_content"
    assert entry.entity_id == "en"
    assert entry.data == {"keys": sorted([KEY_A, KEY_B])}
    assert entry.ip


def test_site_content_put_unchanged_values_are_not_audited(editor, db):
    db.add(SiteContent(key=KEY_A, locale="en", value="Same"))
    db.commit()
    assert editor.put(f"{ADMIN}/site-content", json={"locale": "en", "items": {KEY_A: "Same"}}).status_code == 200
    assert audit_entries(db, "site_content.update") == []


def test_site_content_empty_value_is_stored_not_deleted(editor, db):
    db.add(SiteContent(key=KEY_A, locale="ar", value="قديم"))
    db.commit()
    r = editor.put(f"{ADMIN}/site-content", json={"locale": "ar", "items": {KEY_A: "", KEY_B: "   "}})
    assert r.status_code == 200
    db.expire_all()
    rows = {row.key: row.value for row in db.scalars(select(SiteContent).where(SiteContent.locale == "ar"))}
    # Both rows exist with "", so the deploy-time seed (inserts missing rows only) cannot restore defaults.
    assert rows == {KEY_A: "", KEY_B: ""}


def test_emptied_values_survive_a_redeploy_seed(editor, db):
    from app.seed.loader import seed_database

    seed_database(db)
    db.commit()
    assert editor.put(f"{ADMIN}/site-content", json={"locale": "en", "items": {KEY_A: ""}}).status_code == 200
    assert editor.put(f"{ADMIN}/free-readings/sign/leo/en", json={"title": "", "body": ""}).status_code == 200
    seed_database(db)  # deployments run the seed on every start
    db.commit()
    db.expire_all()
    assert db.scalar(select(SiteContent.value).where(SiteContent.key == KEY_A, SiteContent.locale == "en")) == ""
    leo = db.scalar(select(FreeReading).where(FreeReading.key == "leo", FreeReading.locale == "en"))
    assert leo is not None and (leo.title, leo.body) == ("", "")


def test_site_content_markdown_is_rendered_publicly(editor, client):
    editor.put(f"{ADMIN}/site-content", json={"locale": "en", "items": {MARKDOWN_KEY: "**Hi** <script>x</script>"}})
    html = client.get(f"{PUBLIC}/site-content").json()["html"][MARKDOWN_KEY]
    assert "<strong>Hi</strong>" in html and "<script" not in html


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"locale": "en", "items": {"home.unknown": "x"}}, "items"),
        ({"locale": "fr", "items": {KEY_A: "x"}}, "locale"),
        ({"locale": "en", "items": {KEY_A: "x" * 20_001}}, f"items.{KEY_A}"),
        ({"locale": "en", "items": {KEY_A: "nul\x00byte"}}, f"items.{KEY_A}"),
        ({"locale": "en", "items": {KEY_A: 5}}, f"items.{KEY_A}"),
        ({"locale": "en"}, "items"),
        ({"locale": "en", "items": {}, "extra": 1}, "extra"),
    ],
)
def test_site_content_put_validation(editor, db, body, field):
    r = editor.put(f"{ADMIN}/site-content", json=body)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert field in error_fields(r)
    assert db.scalar(select(SiteContent)) is None


def test_site_content_accepts_max_length_value(editor):
    r = editor.put(f"{ADMIN}/site-content", json={"locale": "en", "items": {KEY_A: "x" * 20_000}})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Free readings
# ---------------------------------------------------------------------------


def test_free_readings_grid_and_filters(editor, db):
    db.add(FreeReading(kind=FreeReadingKind.SIGN, key="leo", locale="ar", title="الأسد", body="نص"))
    db.commit()
    body = editor.get(f"{ADMIN}/free-readings").json()
    expected = (len(WESTERN_SIGNS) + len(CHINESE_ANIMALS)) * 2
    assert body["total"] == expected == len(body["items"])
    signs_ar = editor.get(f"{ADMIN}/free-readings", params={"kind": "sign", "locale": "ar"}).json()["items"]
    assert [i["key"] for i in signs_ar] == list(WESTERN_SIGNS)
    leo = next(i for i in signs_ar if i["key"] == "leo")
    assert (leo["title"], leo["body"], leo["kind"], leo["locale"]) == ("الأسد", "نص", "sign", "ar")
    assert leo["id"] is not None
    aries = signs_ar[0]
    assert (aries["id"], aries["title"], aries["body"], aries["updated_at"]) == (None, "", "", None)
    animals = editor.get(f"{ADMIN}/free-readings", params={"kind": "animal"}).json()["items"]
    assert {i["kind"] for i in animals} == {"animal"} and len(animals) == len(CHINESE_ANIMALS) * 2


@pytest.mark.parametrize("params", [{"kind": "planet"}, {"locale": "fr"}])
def test_free_readings_list_validation(editor, params):
    assert editor.get(f"{ADMIN}/free-readings", params=params).status_code == 422


def test_free_reading_upsert_creates_then_updates(editor, db, client):
    url = f"{ADMIN}/free-readings/sign/leo/en"
    r = editor.put(url, json={"title": "Leo", "body": "Bold **heart**"})
    assert r.status_code == 200
    first = r.json()
    assert (first["kind"], first["key"], first["locale"], first["title"]) == ("sign", "leo", "en", "Leo")
    r = editor.put(url, json={"title": "Leo 2", "body": "Updated"})
    assert r.json()["id"] == first["id"]
    assert r.json()["title"] == "Leo 2"
    db.expire_all()
    assert db.scalar(select(FreeReading).where(FreeReading.key == "leo")).body == "Updated"
    entries = audit_entries(db, "free_reading.update")
    assert len(entries) == 2
    assert entries[0].data == {"kind": "sign", "key": "leo", "locale": "en"}
    assert entries[0].entity_id == str(first["id"])


def test_free_reading_empty_values_are_stored(editor, db):
    db.add(FreeReading(kind=FreeReadingKind.ANIMAL, key="horse", locale="ar", title="الحصان", body="نص"))
    db.commit()
    r = editor.put(f"{ADMIN}/free-readings/animal/horse/ar", json={"title": "", "body": ""})
    assert r.status_code == 200
    db.expire_all()
    row = db.scalar(select(FreeReading).where(FreeReading.key == "horse"))
    assert row is not None and (row.title, row.body) == ("", "")


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/free-readings/planet/leo/en", 422),
        ("/free-readings/sign/horse/en", 422),  # an animal key under "sign"
        ("/free-readings/animal/leo/en", 422),
        ("/free-readings/sign/leo/fr", 422),
        ("/free-readings/sign/LEO/en", 422),
    ],
)
def test_free_reading_upsert_validates_target(editor, db, path, status):
    r = editor.put(f"{ADMIN}{path}", json={"title": "T", "body": "B"})
    assert r.status_code == status
    assert r.json()["error"]["code"] == "validation_error"
    assert db.scalar(select(FreeReading)) is None


@pytest.mark.parametrize(
    "body", [{"title": "x" * 301, "body": "b"}, {"title": "t", "body": "b" * 20_001}, {"title": "t"}, {}]
)
def test_free_reading_upsert_validates_body(editor, body):
    assert editor.put(f"{ADMIN}/free-readings/sign/leo/en", json=body).status_code == 422


# ---------------------------------------------------------------------------
# Offers
# ---------------------------------------------------------------------------


def offer_body(slug: str = "spring-sale", **fields: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "slug": slug,
        "translations": {
            "en": {"title": "Spring sale", "subtitle": "10% off", "body": "Save **now**", "cta_label": "Get it"},
            "ar": {"title": "تخفيضات الربيع", "subtitle": "", "body": "", "cta_label": ""},
        },
        "cta_url": "/reading",
    }
    body.update(fields)
    return body


def add_discount(db, code: str = "SAVE10", **fields: Any) -> DiscountCode:
    discount = DiscountCode(code=code, kind=fields.pop("kind", DiscountKind.PERCENT), value=fields.pop("value", 10))
    for name, value in fields.items():
        setattr(discount, name, value)
    db.add(discount)
    db.commit()
    return discount


def test_offer_create_get_list(editor, db):
    discount = add_discount(db)
    r = editor.post(f"{ADMIN}/offers", json=offer_body(slug="  Spring-Sale ", discount_code_id=discount.id))
    assert r.status_code == 201, r.text
    offer = r.json()
    assert offer["slug"] == "spring-sale"
    assert offer["discount_code"] == "SAVE10"
    assert offer["is_live"] is True
    assert offer["show_banner"] is True and offer["is_active"] is True
    assert set(offer["translations"]) == {"en", "ar"}
    assert editor.get(f"{ADMIN}/offers/{offer['id']}").json()["slug"] == "spring-sale"
    listing = editor.get(f"{ADMIN}/offers").json()
    assert (listing["total"], listing["page"], listing["page_size"]) == (1, 1, 20)
    [entry] = audit_entries(db, "offer.create")
    assert (entry.entity_type, entry.entity_id, entry.data) == ("offer", str(offer["id"]), {"slug": "spring-sale"})


def test_offer_blank_translation_is_dropped(editor):
    body = offer_body(translations={"en": {"title": "Only English"}, "ar": {"title": " ", "body": ""}})
    r = editor.post(f"{ADMIN}/offers", json=body)
    assert r.status_code == 201
    assert list(r.json()["translations"]) == ["en"]


def test_offer_list_pagination_and_order(editor, db):
    for i, slug in enumerate(["c-offer", "a-offer", "b-offer"]):
        editor.post(f"{ADMIN}/offers", json=offer_body(slug=slug, sort_order=[3, 1, 2][i]))
    page = editor.get(f"{ADMIN}/offers", params={"page": 2, "page_size": 2}).json()
    assert [o["slug"] for o in page["items"]] == ["c-offer"]
    assert (page["total"], page["page"], page["page_size"]) == (3, 2, 2)
    assert editor.get(f"{ADMIN}/offers", params={"page_size": 101}).status_code == 422
    assert editor.get(f"{ADMIN}/offers", params={"page": 0}).status_code == 422


def test_offer_duplicate_slug_conflicts(editor, db):
    assert editor.post(f"{ADMIN}/offers", json=offer_body()).status_code == 201
    r = editor.post(f"{ADMIN}/offers", json=offer_body())
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "slug_taken"
    other = editor.post(f"{ADMIN}/offers", json=offer_body(slug="other")).json()
    r = editor.patch(f"{ADMIN}/offers/{other['id']}", json={"slug": "spring-sale"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "slug_taken"


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"slug": "a"}, "slug"),
        ({"slug": "bad slug!"}, "slug"),
        ({"slug": "x" * 121}, "slug"),
        ({"translations": {"ar": {"title": "عربي"}}}, "translations"),
        ({"translations": {"en": {"title": "T"}, "fr": {"title": "F"}}}, "translations"),
        ({"translations": {"en": {"title": "T"}, "ar": {"body": "no title"}}}, "translations"),
        ({"translations": {"en": {"title": "x" * 201}}}, "translations.en.title"),
        ({"translations": {"en": {"title": "T", "evil": 1}}}, "translations.en.evil"),
        ({"cta_url": "javascript:alert(1)"}, "cta_url"),
        ({"cta_url": "//evil.example.com"}, "cta_url"),
        ({"cta_url": "/\\evil.example.com"}, "cta_url"),
        ({"image_url": "data:image/png;base64,AAAA"}, "image_url"),
        ({"discount_code_id": 0}, "discount_code_id"),
        ({"sort_order": 10**9}, "sort_order"),
        ({"is_active": "maybe"}, "is_active"),
    ],
)
def test_offer_create_validation(editor, db, overrides, field):
    r = editor.post(f"{ADMIN}/offers", json=offer_body(**overrides))
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "validation_error"
    assert field in error_fields(r)
    assert db.scalar(select(Offer)) is None


def test_offer_rejects_unknown_discount_and_bad_window(editor):
    r = editor.post(f"{ADMIN}/offers", json=offer_body(discount_code_id=999))
    assert r.status_code == 422 and error_fields(r) == ["discount_code_id"]
    now = datetime(2030, 1, 1, tzinfo=UTC)
    r = editor.post(
        f"{ADMIN}/offers", json=offer_body(starts_at=now.isoformat(), ends_at=(now - timedelta(days=1)).isoformat())
    )
    assert r.status_code == 422 and error_fields(r) == ["ends_at"]
    r = editor.post(f"{ADMIN}/offers", json=offer_body(starts_at=now.isoformat(), ends_at=now.isoformat()))
    assert r.status_code == 422


def test_offer_naive_datetimes_are_utc(editor):
    r = editor.post(f"{ADMIN}/offers", json=offer_body(starts_at="2030-01-01T10:00:00", ends_at="2030-01-02T10:00"))
    assert r.status_code == 201
    assert datetime.fromisoformat(r.json()["starts_at"]) == datetime(2030, 1, 1, 10, tzinfo=UTC)
    assert r.json()["is_live"] is False


def test_offer_patch_partial_update(editor, db):
    offer = editor.post(f"{ADMIN}/offers", json=offer_body(starts_at="2030-01-01T00:00:00Z")).json()
    url = f"{ADMIN}/offers/{offer['id']}"
    r = editor.patch(url, json={"show_banner": False, "starts_at": None})
    assert r.status_code == 200
    assert r.json()["show_banner"] is False and r.json()["starts_at"] is None
    assert r.json()["translations"] == offer["translations"]  # omitted fields are kept
    [entry] = audit_entries(db, "offer.update")
    assert entry.data == {"slug": "spring-sale", "fields": ["show_banner", "starts_at"]}
    # A no-op patch is not audited.
    assert editor.patch(url, json={"show_banner": False}).status_code == 200
    assert len(audit_entries(db, "offer.update")) == 1


def test_offer_patch_validation(editor, db):
    offer = editor.post(f"{ADMIN}/offers", json=offer_body(ends_at="2030-01-01T00:00:00Z")).json()
    url = f"{ADMIN}/offers/{offer['id']}"
    assert editor.patch(url, json={"slug": None}).status_code == 422  # not nullable
    assert editor.patch(url, json={"translations": None}).status_code == 422
    # The window is checked against the stored ends_at.
    r = editor.patch(url, json={"starts_at": "2030-02-01T00:00:00Z"})
    assert r.status_code == 422 and error_fields(r) == ["ends_at"]
    assert editor.patch(url, json={"discount_code_id": 12345}).status_code == 422
    assert editor.patch(url, json={"unknown": 1}).status_code == 422


def test_offer_patch_discount_link(editor, db):
    discount = add_discount(db)
    offer = editor.post(f"{ADMIN}/offers", json=offer_body()).json()
    url = f"{ADMIN}/offers/{offer['id']}"
    assert editor.patch(url, json={"discount_code_id": discount.id}).json()["discount_code"] == "SAVE10"
    assert editor.patch(url, json={"discount_code_id": None}).json()["discount_code"] is None


def test_offer_delete(editor, db, client):
    offer = editor.post(f"{ADMIN}/offers", json=offer_body()).json()
    assert client.get(f"{PUBLIC}/offers/spring-sale").status_code == 200
    r = editor.delete(f"{ADMIN}/offers/{offer['id']}")
    assert r.status_code == 200 and r.json() == {"deleted": True}
    assert editor.get(f"{ADMIN}/offers/{offer['id']}").status_code == 404
    assert editor.delete(f"{ADMIN}/offers/{offer['id']}").status_code == 404
    assert client.get(f"{PUBLIC}/offers/spring-sale").status_code == 404
    assert [e.data for e in audit_entries(db, "offer.delete")] == [{"slug": "spring-sale"}]


@pytest.mark.parametrize("bad_id", ["0", "-1", "abc", str(2**63)])
def test_offer_bad_ids(editor, bad_id):
    assert editor.get(f"{ADMIN}/offers/{bad_id}").status_code == 422


# ---------------------------------------------------------------------------
# Discounts
# ---------------------------------------------------------------------------


def test_discount_create_percent(manager, db):
    r = manager.post(
        f"{ADMIN}/discounts",
        json={"code": " save-20_x ", "kind": "percent", "value": 20, "currency": "usd", "max_redemptions": 5},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["code"] == "SAVE-20_X"
    assert body["currency"] is None  # only fixed discounts carry a currency
    assert (body["redemptions_count"], body["max_redemptions"], body["is_active"]) == (0, 5, True)
    [entry] = audit_entries(db, "discount.create")
    assert entry.data == {"code": "SAVE-20_X", "kind": "percent", "value": 20}


def test_discount_create_fixed(manager):
    r = manager.post(f"{ADMIN}/discounts", json={"code": "FIVE", "kind": "fixed", "value": 500, "currency": "usd"})
    assert r.status_code == 201
    assert (r.json()["currency"], r.json()["value"]) == ("USD", 500)


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"code": "AB", "kind": "percent", "value": 10}, "code"),
        ({"code": "WITH SPACE", "kind": "percent", "value": 10}, "code"),
        ({"code": "X" * 65, "kind": "percent", "value": 10}, "code"),
        ({"code": "ÜBER", "kind": "percent", "value": 10}, "code"),
        ({"code": "ZERO", "kind": "percent", "value": 0}, "value"),
        ({"code": "MANY", "kind": "percent", "value": 101}, "value"),
        ({"code": "NOCUR", "kind": "fixed", "value": 100}, "currency"),
        ({"code": "BADCUR", "kind": "fixed", "value": 100, "currency": "US"}, "currency"),
        ({"code": "BADCUR", "kind": "fixed", "value": 100, "currency": "U5D"}, "currency"),
        ({"code": "KIND", "kind": "bogus", "value": 10}, "kind"),
        ({"code": "MAXR", "kind": "percent", "value": 10, "max_redemptions": 0}, "max_redemptions"),
        (
            {
                "code": "WINDOW",
                "kind": "percent",
                "value": 10,
                "starts_at": "2030-01-02T00:00:00Z",
                "ends_at": "2030-01-01T00:00:00Z",
            },
            "ends_at",
        ),
    ],
)
def test_discount_validation(manager, db, body, field):
    r = manager.post(f"{ADMIN}/discounts", json=body)
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "validation_error"
    assert field in error_fields(r)
    assert db.scalar(select(DiscountCode)) is None


def test_discount_code_is_unique_case_insensitively(manager):
    assert (
        manager.post(f"{ADMIN}/discounts", json={"code": "SAVE10", "kind": "percent", "value": 10}).status_code == 201
    )
    r = manager.post(f"{ADMIN}/discounts", json={"code": "save10", "kind": "percent", "value": 5})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "code_taken"
    other = manager.post(f"{ADMIN}/discounts", json={"code": "OTHER", "kind": "percent", "value": 5}).json()
    assert manager.patch(f"{ADMIN}/discounts/{other['id']}", json={"code": "Save10"}).status_code == 409


def test_discount_list_get_patch(manager, db):
    first = manager.post(f"{ADMIN}/discounts", json={"code": "FIRST", "kind": "percent", "value": 10}).json()
    manager.post(f"{ADMIN}/discounts", json={"code": "SECOND", "kind": "percent", "value": 15})
    listing = manager.get(f"{ADMIN}/discounts").json()
    assert listing["total"] == 2 and {d["code"] for d in listing["items"]} == {"FIRST", "SECOND"}
    url = f"{ADMIN}/discounts/{first['id']}"
    assert manager.get(url).json()["code"] == "FIRST"
    r = manager.patch(url, json={"description": "Launch", "is_active": False, "max_redemptions": None})
    assert r.status_code == 200
    assert (r.json()["description"], r.json()["is_active"]) == ("Launch", False)
    [entry] = audit_entries(db, "discount.update")
    assert entry.data == {"code": "FIRST", "fields": ["description", "is_active"]}
    assert manager.get(f"{ADMIN}/discounts/999").status_code == 404


def test_discount_patch_checks_merged_rules(manager):
    pct = manager.post(f"{ADMIN}/discounts", json={"code": "PCT", "kind": "percent", "value": 50}).json()
    url = f"{ADMIN}/discounts/{pct['id']}"
    r = manager.patch(url, json={"kind": "fixed"})  # a fixed discount needs a currency
    assert r.status_code == 422 and error_fields(r) == ["currency"]
    r = manager.patch(url, json={"value": 150})
    assert r.status_code == 422 and error_fields(r) == ["value"]
    r = manager.patch(url, json={"kind": "fixed", "value": 1500, "currency": "eur"})
    assert r.status_code == 200
    assert (r.json()["kind"], r.json()["value"], r.json()["currency"]) == ("fixed", 1500, "EUR")
    r = manager.patch(url, json={"kind": "percent", "value": 20})
    assert (r.json()["kind"], r.json()["currency"]) == ("percent", None)
    assert manager.patch(url, json={"kind": None}).status_code == 422


def test_discount_delete_unused(manager, db):
    d = manager.post(f"{ADMIN}/discounts", json={"code": "GONE", "kind": "percent", "value": 10}).json()
    r = manager.delete(f"{ADMIN}/discounts/{d['id']}")
    assert r.status_code == 200
    assert r.json() == {"deleted": True, "deactivated": False}
    assert manager.get(f"{ADMIN}/discounts/{d['id']}").status_code == 404
    assert [e.data for e in audit_entries(db, "discount.delete")] == [{"code": "GONE"}]


def test_discount_delete_with_redemptions_deactivates(manager, db):
    discount = add_discount(db, "USED", redemptions_count=3)
    r = manager.delete(f"{ADMIN}/discounts/{discount.id}")
    assert r.json() == {"deleted": False, "deactivated": True}
    db.expire_all()
    assert db.get(DiscountCode, discount.id).is_active is False
    assert len(audit_entries(db, "discount.deactivate")) == 1


def test_discount_delete_referenced_by_order_deactivates(manager, db):
    discount = add_discount(db, "ORDERED")
    db.add(
        Order(
            email="buyer@example.com",
            locale="en",
            calc_version="1",
            list_price_cents=2900,
            discount_code_id=discount.id,
            discount_cents=290,
            amount_cents=2610,
            currency="USD",
            payment_provider="fake",
            access_token_hash="0" * 64,
        )
    )
    db.commit()
    r = manager.delete(f"{ADMIN}/discounts/{discount.id}")
    assert r.json() == {"deleted": False, "deactivated": True}
    db.expire_all()
    assert db.get(DiscountCode, discount.id) is not None


# ---------------------------------------------------------------------------
# Galaxy Library
# ---------------------------------------------------------------------------


def series_body(slug: str = "dragon-ram", **fields: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "slug": slug,
        "translations": {"en": {"title": "The Dragon and the Ram", "description": "A *saga*"}},
        "is_published": True,
    }
    body.update(fields)
    return body


def book_body(slug: str = "book-one", **fields: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "slug": slug,
        "translations": {"en": {"title": "Book One"}, "ar": {"title": "الكتاب الأول"}},
        "purchase_url": "https://shop.example.com/book-one",
        "is_published": True,
    }
    body.update(fields)
    return body


def test_series_and_books_crud(editor, db, client):
    r = editor.post(f"{ADMIN}/book-series", json=series_body())
    assert r.status_code == 201, r.text
    series = r.json()
    assert (series["books_count"], series["books"], series["is_published"]) == (0, [], True)
    sid = series["id"]
    b2 = editor.post(f"{ADMIN}/book-series/{sid}/books", json=book_body("book-two", sort_order=2))
    b1 = editor.post(f"{ADMIN}/book-series/{sid}/books", json=book_body("book-one", sort_order=1))
    assert b1.status_code == b2.status_code == 201
    assert b1.json()["series_id"] == sid
    detail = editor.get(f"{ADMIN}/book-series/{sid}").json()
    assert [b["slug"] for b in detail["books"]] == ["book-one", "book-two"]
    assert detail["books_count"] == 2
    public = client.get(f"{PUBLIC}/library/dragon-ram").json()
    assert [b["slug"] for b in public["books"]] == ["book-one", "book-two"]

    book_url = f"{ADMIN}/books/{b1.json()['id']}"
    assert editor.get(book_url).json()["slug"] == "book-one"
    r = editor.patch(book_url, json={"is_published": False, "purchase_url": None})
    assert r.status_code == 200 and r.json()["purchase_url"] is None
    assert [b["slug"] for b in client.get(f"{PUBLIC}/library/dragon-ram").json()["books"]] == ["book-two"]

    r = editor.patch(f"{ADMIN}/book-series/{sid}", json={"is_published": False, "sort_order": 3})
    assert r.status_code == 200 and r.json()["sort_order"] == 3
    assert client.get(f"{PUBLIC}/library/dragon-ram").status_code == 404

    assert editor.delete(book_url).json() == {"deleted": True}
    assert editor.get(book_url).status_code == 404
    assert editor.delete(f"{ADMIN}/book-series/{sid}").json() == {"deleted": True}
    db.expire_all()
    assert db.scalar(select(Book)) is None and db.scalar(select(BookSeries)) is None
    actions = [e.action for e in audit_entries(db)]
    assert actions == [
        "book_series.create",
        "book.create",
        "book.create",
        "book.update",
        "book_series.update",
        "book.delete",
        "book_series.delete",
    ]
    assert audit_entries(db, "book_series.delete")[0].data == {"slug": "dragon-ram", "books_deleted": 1}


def test_series_list_pagination(editor):
    for i in range(3):
        editor.post(f"{ADMIN}/book-series", json=series_body(f"series-{i}", sort_order=-i))
    page = editor.get(f"{ADMIN}/book-series", params={"page_size": 2}).json()
    assert [s["slug"] for s in page["items"]] == ["series-2", "series-1"]
    assert (page["total"], page["page_size"]) == (3, 2)


def test_library_slug_uniqueness_scopes(editor):
    a = editor.post(f"{ADMIN}/book-series", json=series_body("series-a")).json()
    b = editor.post(f"{ADMIN}/book-series", json=series_body("series-b")).json()
    r = editor.post(f"{ADMIN}/book-series", json=series_body("series-a"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "slug_taken"
    assert editor.patch(f"{ADMIN}/book-series/{b['id']}", json={"slug": "series-a"}).status_code == 409
    # Book slugs are unique per series only.
    assert editor.post(f"{ADMIN}/book-series/{a['id']}/books", json=book_body("same")).status_code == 201
    assert editor.post(f"{ADMIN}/book-series/{b['id']}/books", json=book_body("same")).status_code == 201
    r = editor.post(f"{ADMIN}/book-series/{a['id']}/books", json=book_body("same"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "slug_taken"
    other = editor.post(f"{ADMIN}/book-series/{a['id']}/books", json=book_body("other")).json()
    assert editor.patch(f"{ADMIN}/books/{other['id']}", json={"slug": "same"}).status_code == 409


def test_library_validation(editor):
    assert editor.post(f"{ADMIN}/book-series", json=series_body(translations={"ar": {"title": "x"}})).status_code == 422
    assert editor.post(f"{ADMIN}/book-series", json=series_body(cover_image_url="ftp://x/y.png")).status_code == 422
    sid = editor.post(f"{ADMIN}/book-series", json=series_body()).json()["id"]
    r = editor.post(f"{ADMIN}/book-series/{sid}/books", json=book_body(purchase_url="javascript:alert(1)"))
    assert r.status_code == 422 and "purchase_url" in error_fields(r)
    assert editor.post(f"{ADMIN}/book-series/999/books", json=book_body()).status_code == 404
    assert editor.patch(f"{ADMIN}/books/999", json={"sort_order": 1}).status_code == 404
    assert editor.delete(f"{ADMIN}/book-series/999").status_code == 404


# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------


def post_body(slug: str = "hello-world", **fields: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "slug": slug,
        "translations": {
            "en": {
                "title": "Hello world",
                "excerpt": "First post",
                "body": "## Intro\n\nText",
                "seo_title": "Hello SEO",
                "seo_description": "Meta",
            },
            "ar": {"title": "مرحبا", "body": "نص"},
        },
    }
    body.update(fields)
    return body


def test_post_lifecycle(editor, db, client):
    r = editor.post(f"{ADMIN}/blog-posts", json=post_body(author_name="Astra"))
    assert r.status_code == 201, r.text
    post = r.json()
    assert (post["status"], post["published_at"], post["author_name"]) == ("draft", None, "Astra")
    assert post["available_locales"] == ["en", "ar"]
    assert post["translations"]["ar"]["excerpt"] == ""
    url = f"{ADMIN}/blog-posts/{post['id']}"
    assert client.get(f"{PUBLIC}/blog/hello-world").status_code == 404

    before = utcnow()
    r = editor.post(f"{url}/publish")
    assert r.status_code == 200
    published = r.json()
    assert published["status"] == "published"
    assert datetime.fromisoformat(published["published_at"]) >= before - timedelta(seconds=1)
    assert client.get(f"{PUBLIC}/blog/hello-world").json()["title"] == "Hello world"

    # Publishing twice is a no-op; unpublishing keeps the original date for re-publishing.
    assert editor.post(f"{url}/publish").json()["published_at"] == published["published_at"]
    r = editor.post(f"{url}/unpublish")
    assert r.json()["status"] == "draft"
    assert client.get(f"{PUBLIC}/blog/hello-world").status_code == 404
    assert editor.post(f"{url}/unpublish").json()["status"] == "draft"
    assert editor.post(f"{url}/publish").json()["published_at"] == published["published_at"]

    assert editor.delete(url).json() == {"deleted": True}
    assert editor.get(url).status_code == 404
    actions = [e.action for e in audit_entries(db)]
    assert actions == [
        "blog_post.create",
        "blog_post.publish",
        "blog_post.unpublish",
        "blog_post.publish",
        "blog_post.delete",
    ]


def test_publish_keeps_a_scheduled_date(editor, client):
    future = (utcnow() + timedelta(days=2)).replace(microsecond=0)
    post = editor.post(f"{ADMIN}/blog-posts", json=post_body()).json()
    url = f"{ADMIN}/blog-posts/{post['id']}"
    assert editor.patch(url, json={"published_at": future.isoformat()}).status_code == 200
    r = editor.post(f"{url}/publish")
    assert datetime.fromisoformat(r.json()["published_at"]) == future
    assert client.get(f"{PUBLIC}/blog/hello-world").status_code == 404  # scheduled, not yet visible


def test_publish_requires_a_default_locale_body(editor, db):
    body = post_body(translations={"en": {"title": "Title only"}})
    post = editor.post(f"{ADMIN}/blog-posts", json=body).json()
    r = editor.post(f"{ADMIN}/blog-posts/{post['id']}/publish")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "post_incomplete"
    db.expire_all()
    assert db.get(BlogPost, post["id"]).status == PostStatus.DRAFT


def test_published_post_needs_a_date(editor):
    post = editor.post(f"{ADMIN}/blog-posts", json=post_body()).json()
    url = f"{ADMIN}/blog-posts/{post['id']}"
    editor.post(f"{url}/publish")
    r = editor.patch(url, json={"published_at": None})
    assert r.status_code == 422 and error_fields(r) == ["published_at"]


def test_post_patch(editor, db):
    post = editor.post(f"{ADMIN}/blog-posts", json=post_body()).json()
    url = f"{ADMIN}/blog-posts/{post['id']}"
    new_translations = {"en": {"title": "Renamed", "body": "B"}}
    r = editor.patch(url, json={"translations": new_translations, "slug": "renamed", "cover_image_url": "/x.png"})
    assert r.status_code == 200
    body = r.json()
    assert (body["slug"], body["title"], body["cover_image_url"]) == ("renamed", "Renamed", "/x.png")
    assert body["available_locales"] == ["en"]
    [entry] = audit_entries(db, "blog_post.update")
    assert entry.data == {"slug": "renamed", "fields": ["cover_image_url", "slug", "translations"]}
    assert editor.patch(url, json={"status": "published"}).status_code == 422  # only via /publish
    assert editor.patch(url, json={"author_name": ""}).status_code == 422


def test_post_slug_conflicts(editor):
    assert editor.post(f"{ADMIN}/blog-posts", json=post_body("taken")).status_code == 201
    r = editor.post(f"{ADMIN}/blog-posts", json=post_body("taken"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "slug_taken"
    other = editor.post(f"{ADMIN}/blog-posts", json=post_body("other")).json()
    assert editor.patch(f"{ADMIN}/blog-posts/{other['id']}", json={"slug": "taken"}).status_code == 409
    # Blog slugs may be longer than offer/library slugs (VARCHAR 160).
    assert editor.post(f"{ADMIN}/blog-posts", json=post_body("p" * 160)).status_code == 201
    assert editor.post(f"{ADMIN}/blog-posts", json=post_body("p" * 161)).status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [
        {"translations": {}},
        {"translations": {"en": {"title": "T", "body": "x" * 100_001}}},
        {"translations": {"en": {"title": "T", "excerpt": "x" * 501}}},
        {"cover_image_url": "javascript:alert(1)"},
        {"status": "published"},
    ],
)
def test_post_create_validation(editor, overrides):
    assert editor.post(f"{ADMIN}/blog-posts", json=post_body(**overrides)).status_code == 422


def test_post_list_filter_pagination_and_order(editor, db):
    ids = [editor.post(f"{ADMIN}/blog-posts", json=post_body(f"post-{i}")).json()["id"] for i in range(3)]
    editor.post(f"{ADMIN}/blog-posts/{ids[0]}/publish")  # touches updated_at: now the newest
    listing = editor.get(f"{ADMIN}/blog-posts").json()
    assert [p["id"] for p in listing["items"]] == [ids[0], ids[2], ids[1]]
    assert (listing["total"], listing["page"], listing["page_size"]) == (3, 1, 20)
    assert set(listing["items"][0]) >= {"id", "slug", "status", "title", "published_at", "updated_at"}
    drafts = editor.get(f"{ADMIN}/blog-posts", params={"status": "draft"}).json()
    assert [p["id"] for p in drafts["items"]] == [ids[2], ids[1]]
    published = editor.get(f"{ADMIN}/blog-posts", params={"status": "published"}).json()
    assert [p["id"] for p in published["items"]] == [ids[0]]
    page2 = editor.get(f"{ADMIN}/blog-posts", params={"page": 2, "page_size": 2}).json()
    assert [p["id"] for p in page2["items"]] == [ids[1]]
    assert editor.get(f"{ADMIN}/blog-posts", params={"status": "bogus"}).status_code == 422


# ---------------------------------------------------------------------------
# Markdown preview
# ---------------------------------------------------------------------------


def test_markdown_preview_sanitises(editor):
    r = editor.post(
        f"{ADMIN}/markdown/preview",
        json={"markdown": "# T\n\n**b** <script>alert(1)</script> <img src=x onerror=alert(1)> [l](javascript:x)"},
    )
    assert r.status_code == 200
    html = r.json()["html"]
    assert "<strong>b</strong>" in html
    assert "<script" not in html and "<img" not in html and 'href="javascript' not in html


def test_markdown_preview_limits(editor):
    assert editor.post(f"{ADMIN}/markdown/preview", json={"markdown": "x" * 100_000}).status_code == 200
    r = editor.post(f"{ADMIN}/markdown/preview", json={"markdown": "x" * 100_001})
    assert r.status_code == 422 and error_fields(r) == ["markdown"]
    assert editor.post(f"{ADMIN}/markdown/preview", json={}).status_code == 422


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


def test_settings_get(manager):
    body = manager.get(f"{ADMIN}/settings").json()
    assert body["defaults"] == DEFAULTS
    assert body["values"] == DEFAULTS


def test_settings_put_persists_and_audits(manager, db, client):
    r = manager.put(f"{ADMIN}/settings", json={"values": {"paid_price_cents": 3900, "email_attach_pdf": True}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["values"]["paid_price_cents"] == 3900 and body["values"]["email_attach_pdf"] is True
    assert body["defaults"]["paid_price_cents"] == 2900
    assert manager.get(f"{ADMIN}/settings").json()["values"]["paid_price_cents"] == 3900
    assert client.get(f"{PUBLIC}/public-config").json()["paid_price_cents"] == 3900
    [entry] = audit_entries(db, "settings.update")
    assert entry.data == {
        "changes": {
            "paid_price_cents": {"from": 2900, "to": 3900},
            "email_attach_pdf": {"from": False, "to": True},
        }
    }
    # Same values again: nothing to audit.
    manager.put(f"{ADMIN}/settings", json={"values": {"paid_price_cents": 3900}})
    assert len(audit_entries(db, "settings.update")) == 1


def test_settings_int_is_accepted_for_float_settings(manager):
    r = manager.put(f"{ADMIN}/settings", json={"values": {"gemini_temperature": 1}})
    assert r.status_code == 200 and r.json()["values"]["gemini_temperature"] == 1.0


@pytest.mark.parametrize(
    "values",
    [
        {"paid_price_cents": 10},
        {"paid_price_cents": "2900"},
        {"paid_price_cents": True},
        {"email_attach_pdf": 1},
        {"currency": "DOLLARS"},
        {"chinese_year_boundary": "solstice"},
        {"gemini_timeout_seconds": 600},
        {"no_such_setting": 1},
        {"prompt_delay_min_seconds": 5, "prompt_delay_max_seconds": 2},
    ],
)
def test_settings_put_validation(manager, db, values):
    r = manager.put(f"{ADMIN}/settings", json={"values": values})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_setting"
    assert r.json()["error"]["message"]
    assert manager.get(f"{ADMIN}/settings").json()["values"] == DEFAULTS
    assert audit_entries(db, "settings.update") == []


def test_settings_put_body_shape(manager):
    assert manager.put(f"{ADMIN}/settings", json={"paid_price_cents": 100}).status_code == 422
    assert manager.put(f"{ADMIN}/settings", json={"values": []}).status_code == 422
