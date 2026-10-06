"""Shared field types and the public response models of the content API (docs/ARCHITECTURE.md §5).

Admin request/response models live in ``app.content.admin_schemas``.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Annotated, Generic, TypeVar
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, Field, StringConstraints

from app.utils import supported_locales

MAX_DB_ID = 2**63 - 1  # BIGINT primary keys

_SLUG_RE = re.compile(r"[a-z0-9-]{2,120}")
_POST_SLUG_RE = re.compile(r"[a-z0-9-]{2,160}")  # blog_posts.slug is VARCHAR(160)

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------


def reject_nul(value: str) -> str:
    # PostgreSQL TEXT and JSONB cannot store U+0000; reject it here instead of failing with a 500.
    if "\x00" in value:
        raise ValueError("Text must not contain NUL characters")
    return value


def _check_slug(value: str) -> str:
    if not _SLUG_RE.fullmatch(value):
        raise ValueError("Use 2-120 characters: lower-case letters, digits and '-'")
    return value


def _check_post_slug(value: str) -> str:
    if not _POST_SLUG_RE.fullmatch(value):
        raise ValueError("Use 2-160 characters: lower-case letters, digits and '-'")
    return value


def _check_link(value: str) -> str:
    """Allow a site-relative path ("/reading") or an absolute http(s) URL — nothing else.

    Backslashes are rejected because browsers treat "/\\evil.com" like "//evil.com" (another origin),
    and ``javascript:``/``data:`` URLs are rejected by the scheme check.
    """
    if any(ch.isspace() or ord(ch) < 0x20 or ord(ch) == 0x7F or ch == "\\" for ch in value):
        raise ValueError("URL must not contain spaces, control characters or backslashes")
    if value.startswith("/"):
        if value.startswith("//"):
            raise ValueError("Use a site-relative path (/...) or an http(s):// URL")
        return value
    parts = urlsplit(value)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise ValueError("Use a site-relative path (/...) or an http(s):// URL")
    return value


def _as_utc(value: datetime) -> datetime:
    """Naive datetimes from the dashboard are taken as UTC; aware ones are converted to UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _check_locale(value: str) -> str:
    if value not in supported_locales():
        raise ValueError(f"Unsupported locale; use one of: {', '.join(supported_locales())}")
    return value


# ---------------------------------------------------------------------------
# Reusable field types
# ---------------------------------------------------------------------------

DbId = Annotated[int, Field(ge=1, le=MAX_DB_ID)]
Slug = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True), AfterValidator(_check_slug)]
PostSlug = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True), AfterValidator(_check_post_slug)]
LinkUrl = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500), AfterValidator(_check_link)
]
UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]
SupportedLocale = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True), AfterValidator(_check_locale)]
SortOrder = Annotated[int, Field(ge=-1_000_000, le=1_000_000)]

Label = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80), AfterValidator(reject_nul)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200), AfterValidator(reject_nul)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300), AfterValidator(reject_nul)]
Excerpt = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500), AfterValidator(reject_nul)]
Markdown = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20_000), AfterValidator(reject_nul)]
LongMarkdown = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100_000), AfterValidator(reject_nul)]


class PageQuery(BaseModel):
    """Pagination parameters for admin list endpoints."""

    page: int = Field(default=1, ge=1, le=100_000)
    page_size: int = Field(default=20, ge=1, le=100)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Items(BaseModel, Generic[T]):
    items: list[T]


# ---------------------------------------------------------------------------
# Public responses
# ---------------------------------------------------------------------------


class PublicConfigOut(BaseModel):
    locales: list[str]
    default_locale: str
    paid_price_cents: int
    currency: str
    report_access_hours: int
    payment_provider: str
    min_birth_date: date


class SiteContentOut(BaseModel):
    locale: str
    items: dict[str, str]
    html: dict[str, str]


class OfferOut(BaseModel):
    id: int
    slug: str
    title: str
    subtitle: str | None
    body_html: str
    cta_label: str | None
    cta_url: str | None
    image_url: str | None
    show_banner: bool
    discount_code: str | None
    starts_at: datetime | None
    ends_at: datetime | None


class PostSummaryOut(BaseModel):
    slug: str
    title: str
    excerpt: str
    cover_image_url: str | None
    author_name: str
    published_at: datetime | None


class PostOut(PostSummaryOut):
    body_html: str
    seo_title: str | None
    seo_description: str | None
    available_locales: list[str]


class BookOut(BaseModel):
    slug: str
    title: str
    description_html: str
    cover_image_url: str | None
    purchase_url: str | None


class SeriesOut(BaseModel):
    slug: str
    title: str
    description_html: str
    cover_image_url: str | None
    books: list[BookOut]
