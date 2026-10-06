"""Tests for the public content API: /public-config, /site-content, /offers, /blog, /library, /media."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest

from app.charts.service import MIN_BIRTH_DATE
from app.config import get_settings
from app.content.keys import SITE_CONTENT_KEYS
from app.models import (
    BlogPost,
    Book,
    BookSeries,
    DiscountCode,
    DiscountKind,
    Offer,
    PostStatus,
    SiteContent,
)
from app.settings_store import set_settings
from app.utils import utcnow

API = "/api/v1"
MARKDOWN_KEYS = [k.key for k in SITE_CONTENT_KEYS if k.format == "markdown"]
TEXT_KEYS = [k.key for k in SITE_CONTENT_KEYS if k.format != "markdown"]
XSS = "Hello <script>alert(1)</script> [x](javascript:alert(1)) **bold**"


def _assert_no_script(html: str) -> None:
    assert "<script" not in html.lower()
    assert 'href="javascript:' not in html.lower()


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def add_offer(db, slug: str = "spring", **fields: Any) -> Offer:
    values: dict[str, Any] = {
        "translations": {"en": {"title": f"{slug} title", "subtitle": "Sub", "body": "Body", "cta_label": "Go"}},
        "is_active": True,
        "show_banner": True,
    }
    values.update(fields)
    offer = Offer(slug=slug, **values)
    db.add(offer)
    db.commit()
    return offer


def add_post(db, slug: str = "first-post", *, published: bool = True, **fields: Any) -> BlogPost:
    values: dict[str, Any] = {
        "translations": {"en": {"title": f"{slug} title", "excerpt": "Excerpt", "body": "Body text"}},
        "status": PostStatus.PUBLISHED if published else PostStatus.DRAFT,
        "published_at": utcnow() - timedelta(days=1) if published else None,
    }
    values.update(fields)
    post = BlogPost(slug=slug, **values)
    db.add(post)
    db.commit()
    return post


def add_series(
    db, slug: str = "dragon", *, published: bool = True, books: list[dict[str, Any]] | None = None
) -> BookSeries:
    series = BookSeries(
        slug=slug,
        translations={"en": {"title": f"{slug} series", "description": "Series *intro*"}},
        is_published=published,
    )
    for i, book in enumerate(books or []):
        series.books.append(
            Book(
                slug=book.get("slug", f"book-{i}"),
                translations=book.get("translations", {"en": {"title": f"Book {i}", "description": "About"}}),
                is_published=book.get("is_published", True),
                sort_order=book.get("sort_order", 0),
                purchase_url=book.get("purchase_url"),
            )
        )
    db.add(series)
    db.commit()
    return series


# ---------------------------------------------------------------------------
# /public-config
# ---------------------------------------------------------------------------


def test_public_config_defaults(client):
    r = client.get(f"{API}/public-config")
    assert r.status_code == 200
    assert r.json() == {
        "locales": ["en", "ar"],
        "default_locale": "en",
        "paid_price_cents": 2900,
        "currency": "USD",
        "report_access_hours": 24,
        "payment_provider": get_settings().payment_provider,
        "min_birth_date": MIN_BIRTH_DATE.isoformat(),
    }
    assert r.json()["min_birth_date"] == "1900-01-01"
    assert r.headers["cache-control"] == "public, max-age=60"


def test_public_config_follows_settings(client, db):
    set_settings(db, {"paid_price_cents": 4900, "currency": "EUR", "report_access_hours": 48})
    db.commit()
    body = client.get(f"{API}/public-config").json()
    assert (body["paid_price_cents"], body["currency"], body["report_access_hours"]) == (4900, "EUR", 48)


# ---------------------------------------------------------------------------
# /site-content
# ---------------------------------------------------------------------------


def test_site_content_lists_every_key_even_when_empty(client):
    r = client.get(f"{API}/site-content", params={"locale": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["locale"] == "en"
    assert set(body["items"]) == {k.key for k in SITE_CONTENT_KEYS}
    assert all(value == "" for value in body["items"].values())
    assert set(body["html"]) == set(MARKDOWN_KEYS)
    assert all(value == "" for value in body["html"].values())
    assert r.headers["cache-control"] == "public, max-age=60"


def test_site_content_falls_back_per_key_to_default_locale(client, db):
    title, subtitle, cta = TEXT_KEYS[:3]
    db.add_all(
        [
            SiteContent(key=title, locale="en", value="Two Traditions"),
            SiteContent(key=title, locale="ar", value="تقليدان"),
            SiteContent(key=subtitle, locale="en", value="English only"),
            SiteContent(key=cta, locale="en", value="English CTA"),
            SiteContent(key=cta, locale="ar", value="   "),  # blank counts as untranslated
        ]
    )
    db.commit()
    items = client.get(f"{API}/site-content", params={"locale": "ar"}).json()["items"]
    assert items[title] == "تقليدان"
    assert items[subtitle] == "English only"
    assert items[cta] == "English CTA"
    assert items[TEXT_KEYS[3]] == ""


@pytest.mark.parametrize(("requested", "expected"), [("ar-EG", "ar"), ("AR", "ar"), ("fr", "en"), (None, "en")])
def test_site_content_normalises_locale(client, requested, expected):
    params = {"locale": requested} if requested else {}
    assert client.get(f"{API}/site-content", params=params).json()["locale"] == expected


def test_site_content_renders_and_sanitises_markdown(client, db):
    privacy = MARKDOWN_KEYS[0]
    db.add_all(
        [
            SiteContent(key=privacy, locale="en", value=f"## Privacy\n\n{XSS}"),
            SiteContent(key=TEXT_KEYS[0], locale="en", value="<b>plain</b>"),
        ]
    )
    db.commit()
    body = client.get(f"{API}/site-content", params={"locale": "en"}).json()
    html = body["html"][privacy]
    assert "<h2>Privacy</h2>" in html
    assert "<strong>bold</strong>" in html
    _assert_no_script(html)
    # Raw markdown stays in items; text keys never get an html entry.
    assert body["items"][privacy].startswith("## Privacy")
    assert TEXT_KEYS[0] not in body["html"]
    assert body["items"][TEXT_KEYS[0]] == "<b>plain</b>"


def test_site_content_rejects_overlong_locale(client):
    assert client.get(f"{API}/site-content", params={"locale": "x" * 100}).status_code == 422


# ---------------------------------------------------------------------------
# /offers
# ---------------------------------------------------------------------------


def test_offers_visibility_rules(client, db):
    now = utcnow()
    add_offer(db, "live", sort_order=2)
    add_offer(db, "live-first", sort_order=1, starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=1))
    add_offer(db, "inactive", is_active=False)
    add_offer(db, "not-started", starts_at=now + timedelta(hours=1))
    add_offer(db, "ended", ends_at=now - timedelta(seconds=1))
    r = client.get(f"{API}/offers")
    assert r.status_code == 200
    assert [o["slug"] for o in r.json()["items"]] == ["live-first", "live"]
    assert r.headers["cache-control"] == "public, max-age=60"


def test_offers_banner_filter(client, db):
    add_offer(db, "banner", show_banner=True)
    add_offer(db, "page-only", show_banner=False)
    assert {o["slug"] for o in client.get(f"{API}/offers").json()["items"]} == {"banner", "page-only"}
    banner = client.get(f"{API}/offers", params={"banner": "true"}).json()["items"]
    assert [o["slug"] for o in banner] == ["banner"]
    assert banner[0]["show_banner"] is True


def test_offer_shape_translation_fallback_and_sanitising(client, db):
    discount = DiscountCode(code="SAVE10", kind=DiscountKind.PERCENT, value=10)
    db.add(discount)
    db.flush()
    add_offer(
        db,
        "launch",
        translations={
            "en": {"title": "Launch", "subtitle": "", "body": XSS, "cta_label": "Buy"},
            "ar": {"title": "إطلاق", "subtitle": "عرض", "body": "نص", "cta_label": ""},
        },
        cta_url="/reading",
        image_url="/api/v1/media/" + "a" * 32 + ".png",
        discount_code_id=discount.id,
    )
    en = client.get(f"{API}/offers/launch", params={"locale": "en"}).json()
    assert set(en) == {
        "id",
        "slug",
        "title",
        "subtitle",
        "body_html",
        "cta_label",
        "cta_url",
        "image_url",
        "show_banner",
        "discount_code",
        "starts_at",
        "ends_at",
    }
    assert en["title"] == "Launch"
    assert en["subtitle"] is None  # empty strings become null
    assert en["discount_code"] == "SAVE10"
    assert en["cta_url"] == "/reading"
    _assert_no_script(en["body_html"])
    ar = client.get(f"{API}/offers/launch", params={"locale": "ar"}).json()
    assert (ar["title"], ar["subtitle"], ar["body_html"]) == ("إطلاق", "عرض", "<p>نص</p>\n")
    assert ar["cta_label"] is None


def test_offer_falls_back_to_default_locale_when_untranslated(client, db):
    add_offer(db, "en-only", translations={"en": {"title": "English"}, "ar": {"title": "", "body": "orphan"}})
    assert client.get(f"{API}/offers/en-only", params={"locale": "ar"}).json()["title"] == "English"


def test_offer_hides_discount_code_that_checkout_would_refuse(client, db):
    now = utcnow()
    codes = [
        DiscountCode(code="OFF", kind=DiscountKind.PERCENT, value=10, is_active=False),
        DiscountCode(code="LATER", kind=DiscountKind.PERCENT, value=10, starts_at=now + timedelta(days=1)),
        DiscountCode(code="OVER", kind=DiscountKind.PERCENT, value=10, ends_at=now - timedelta(days=1)),
        DiscountCode(code="USEDUP", kind=DiscountKind.PERCENT, value=10, max_redemptions=1, redemptions_count=1),
    ]
    db.add_all(codes)
    db.flush()
    for code in codes:
        add_offer(db, code.code.lower(), discount_code_id=code.id)
    assert all(o["discount_code"] is None for o in client.get(f"{API}/offers").json()["items"])


@pytest.mark.parametrize("slug", ["inactive", "not-started", "ended", "missing"])
def test_offer_detail_404_unless_live(client, db, slug):
    now = utcnow()
    add_offer(db, "inactive", is_active=False)
    add_offer(db, "not-started", starts_at=now + timedelta(days=1))
    add_offer(db, "ended", ends_at=now - timedelta(days=1))
    r = client.get(f"{API}/offers/{slug}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------
# /blog
# ---------------------------------------------------------------------------


def test_blog_lists_published_only_newest_first(client, db):
    now = utcnow()
    add_post(db, "old", published_at=now - timedelta(days=3))
    add_post(db, "new", published_at=now - timedelta(hours=1))
    add_post(db, "draft", published=False)
    add_post(db, "scheduled", published_at=now + timedelta(days=1))
    add_post(db, "draft-with-date", status=PostStatus.DRAFT, published_at=now - timedelta(days=5))
    r = client.get(f"{API}/blog")
    assert r.status_code == 200
    body = r.json()
    assert [p["slug"] for p in body["items"]] == ["new", "old"]
    assert (body["total"], body["page"], body["page_size"]) == (2, 1, 9)
    assert set(body["items"][0]) == {
        "slug",
        "title",
        "excerpt",
        "cover_image_url",
        "author_name",
        "published_at",
        "updated_at",
        "available_locales",
    }
    assert r.headers["cache-control"] == "public, max-age=60"


def test_blog_pagination(client, db):
    now = utcnow()
    for i in range(5):
        add_post(db, f"post-{i}", published_at=now - timedelta(hours=i + 1))
    page2 = client.get(f"{API}/blog", params={"page": 2, "page_size": 2}).json()
    assert [p["slug"] for p in page2["items"]] == ["post-2", "post-3"]
    assert (page2["total"], page2["page"], page2["page_size"]) == (5, 2, 2)
    beyond = client.get(f"{API}/blog", params={"page": 9, "page_size": 2}).json()
    assert beyond["items"] == [] and beyond["total"] == 5


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 0}, {"page_size": 51}, {"page": "x"}])
def test_blog_rejects_bad_pagination(client, params):
    r = client.get(f"{API}/blog", params=params)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_blog_post_detail(client, db):
    add_post(
        db,
        "hello",
        translations={
            "en": {
                "title": "Hello",
                "excerpt": "Short",
                "body": f"# Big\n\n{XSS}",
                "seo_title": "SEO Hello",
                "seo_description": "",
            },
            "ar": {"title": "مرحبا", "excerpt": "", "body": "نص **عربي**"},
        },
        author_name="Astra",
    )
    r = client.get(f"{API}/blog/hello", params={"locale": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Hello"
    assert body["author_name"] == "Astra"
    assert body["seo_title"] == "SEO Hello"
    assert body["seo_description"] is None
    assert body["available_locales"] == ["en", "ar"]
    _assert_no_script(body["body_html"])
    ar = client.get(f"{API}/blog/hello", params={"locale": "ar"}).json()
    assert ar["title"] == "مرحبا"
    assert ar["body_html"] == "<p>نص <strong>عربي</strong></p>\n"


def test_blog_post_falls_back_and_reports_available_locales(client, db):
    add_post(db, "en-only", translations={"en": {"title": "English", "body": "B"}, "ar": {"title": " "}})
    body = client.get(f"{API}/blog/en-only", params={"locale": "ar"}).json()
    assert body["title"] == "English"
    assert body["available_locales"] == ["en"]


@pytest.mark.parametrize("slug", ["draft", "scheduled", "nope"])
def test_blog_post_404_for_drafts_scheduled_and_unknown(client, db, slug):
    add_post(db, "draft", published=False)
    add_post(db, "scheduled", published_at=utcnow() + timedelta(hours=2))
    r = client.get(f"{API}/blog/{slug}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------
# /library
# ---------------------------------------------------------------------------


def test_library_lists_published_series_with_published_books(client, db):
    add_series(
        db,
        "dragon",
        books=[
            {"slug": "second", "sort_order": 2, "purchase_url": "https://shop.example.com/2"},
            {"slug": "first", "sort_order": 1},
            {"slug": "hidden", "is_published": False},
        ],
    )
    add_series(db, "secret", published=False, books=[{"slug": "x"}])
    r = client.get(f"{API}/library")
    assert r.status_code == 200
    items = r.json()["items"]
    assert [s["slug"] for s in items] == ["dragon"]
    series = items[0]
    assert series["title"] == "dragon series"
    assert series["description_html"] == "<p>Series <em>intro</em></p>\n"
    assert [b["slug"] for b in series["books"]] == ["first", "second"]
    assert series["books"][1]["purchase_url"] == "https://shop.example.com/2"
    assert set(series["books"][0]) == {"slug", "title", "description_html", "cover_image_url", "purchase_url"}
    assert r.headers["cache-control"] == "public, max-age=60"


def test_library_series_ordering_and_locale(client, db):
    later = add_series(db, "later")
    later.sort_order = 5
    later.translations = {"en": {"title": "Later"}, "ar": {"title": "لاحقا", "description": XSS}}
    db.commit()
    add_series(db, "sooner")
    items = client.get(f"{API}/library", params={"locale": "ar"}).json()["items"]
    assert [s["slug"] for s in items] == ["sooner", "later"]
    assert items[1]["title"] == "لاحقا"
    _assert_no_script(items[1]["description_html"])


def test_library_series_detail(client, db):
    add_series(db, "dragon", books=[{"slug": "one"}])
    add_series(db, "secret", published=False)
    r = client.get(f"{API}/library/dragon")
    assert r.status_code == 200
    assert [b["slug"] for b in r.json()["books"]] == ["one"]
    assert client.get(f"{API}/library/secret").status_code == 404
    assert client.get(f"{API}/library/unknown").status_code == 404


# ---------------------------------------------------------------------------
# /media/{file_name}
# ---------------------------------------------------------------------------


def _write_media(name: str, data: bytes = b"\x89PNG fake") -> None:
    directory = get_settings().media_dir
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(data)


@pytest.mark.parametrize(
    ("ext", "content_type"),
    [("png", "image/png"), ("jpg", "image/jpeg"), ("webp", "image/webp"), ("gif", "image/gif")],
)
def test_media_served_with_long_cache(client, ext, content_type):
    name = f"{'ab' * 16}.{ext}"
    _write_media(name, b"bytes")
    r = client.get(f"{API}/media/{name}")
    assert r.status_code == 200
    assert r.content == b"bytes"
    assert r.headers["content-type"] == content_type
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_media_missing_file_is_404(client):
    r = client.get(f"{API}/media/{'0' * 32}.png")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    "path",
    [
        "/media/../x",
        "/media/..%2F..%2Fapp%2Fconfig.py",
        "/media/%2e%2e%2fsecret.png",
        "/media/..%5C" + "a" * 32 + ".png",
        "/media/" + "A" * 32 + ".png",  # upper-case hex is never generated
        "/media/" + "a" * 31 + ".png",
        "/media/" + "a" * 32 + ".svg",
        "/media/" + "a" * 32 + ".png.html",
        "/media/." + "a" * 32 + ".png.part",
        "/media/" + "a" * 32 + ".PNG",
        "/media/" + "a" * 32,
    ],
)
def test_media_rejects_invalid_names_and_traversal(client, path):
    # Plant files that a sloppy implementation could leak.
    storage = get_settings().storage_dir
    storage.mkdir(parents=True, exist_ok=True)
    (storage / "secret.png").write_bytes(b"secret")
    _write_media("." + "a" * 32 + ".png.part", b"partial")
    _write_media("A" * 32 + ".png", b"upper")
    r = client.get(f"{API}{path}")
    assert r.status_code == 404
    assert b"secret" not in r.content and b"partial" not in r.content and b"upper" not in r.content


def test_media_directory_is_not_served(client):
    (get_settings().media_dir / ("b" * 32 + ".png")).mkdir(parents=True)
    assert client.get(f"{API}/media/{'b' * 32}.png").status_code == 404


# ---------------------------------------------------------------------------
# Seeded content (what a fresh deployment serves)
# ---------------------------------------------------------------------------


def test_seeded_content_is_served(client, db):
    from app.seed.loader import seed_database

    seed_database(db)
    db.commit()
    for locale in ("en", "ar"):
        content = client.get(f"{API}/site-content", params={"locale": locale}).json()
        assert content["items"]["home.hero.title"]
        assert all(content["html"][key] for key in MARKDOWN_KEYS)
        offers = client.get(f"{API}/offers", params={"locale": locale}).json()["items"]
        assert offers and all(o["title"] for o in offers)
        assert client.get(f"{API}/offers/{offers[0]['slug']}", params={"locale": locale}).status_code == 200
        posts = client.get(f"{API}/blog", params={"locale": locale}).json()
        assert posts["total"] >= 1
        post = client.get(f"{API}/blog/{posts['items'][0]['slug']}", params={"locale": locale}).json()
        assert post["body_html"] and post["available_locales"] == ["en", "ar"]
        library = client.get(f"{API}/library", params={"locale": locale}).json()["items"]
        assert library and library[0]["books"]
        assert client.get(f"{API}/library/{library[0]['slug']}", params={"locale": locale}).status_code == 200
