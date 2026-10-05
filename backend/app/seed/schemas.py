"""Pydantic models for seed data.

Seed content is authored in Python modules (and the free-reading JSON files) and validated here,
so a typo in a slug, a missing translation or a template using an unknown variable fails at import
or load time instead of producing a broken site.
"""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.charts.schemas import ChineseAnimal, WesternSign
from app.generation.templating import PromptTemplateError, validate_template
from app.models import DiscountKind

# Every seeded translatable row must be complete in these locales.
REQUIRED_LOCALES: tuple[str, ...] = ("en", "ar")

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_CODE_RE = re.compile(r"^[A-Z0-9_-]{3,64}$")


def _check_slug(value: str) -> str:
    if not _SLUG_RE.fullmatch(value) or len(value) > 120:
        raise ValueError(f"invalid slug: {value!r}")
    return value


def _check_relative_or_https_url(value: str | None) -> str | None:
    if value is None:
        return None
    if not (value.startswith("/") and not value.startswith("//")) and not value.startswith("https://"):
        raise ValueError("URL must be a site-relative path or an https:// URL")
    return value


Slug = Annotated[str, AfterValidator(_check_slug)]
SafeUrl = Annotated[str | None, AfterValidator(_check_relative_or_https_url)]
NonEmpty = Annotated[str, Field(min_length=1)]


def _require_locales(translations: dict[str, object]) -> None:
    missing = [locale for locale in REQUIRED_LOCALES if locale not in translations]
    if missing:
        raise ValueError(f"missing translations for: {', '.join(missing)}")


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


# ---------------------------------------------------------------------------
# Free readings (JSON files written by the content team)
# ---------------------------------------------------------------------------


class FreeReadingEntry(BaseModel):
    # Extra keys (e.g. editorial metadata) are ignored; keys and required fields are strict.
    model_config = ConfigDict(frozen=True, extra="ignore", str_strip_whitespace=True)

    title: Annotated[str, Field(min_length=1, max_length=300)]
    body: NonEmpty  # markdown


class FreeReadingFile(BaseModel):
    """Shape of ``data/free_readings_<locale>.json``; either section may be partial or absent."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    sign: dict[WesternSign, FreeReadingEntry] = Field(default_factory=dict)
    animal: dict[ChineseAnimal, FreeReadingEntry] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


class PromptSeed(_Frozen):
    slot: Annotated[int, Field(ge=1, le=6)]
    name: Annotated[str, Field(min_length=1, max_length=200)]
    section_titles: dict[str, NonEmpty]
    system_instruction: NonEmpty
    template: NonEmpty
    notes: str = ""
    min_words: Annotated[int | None, Field(ge=1)] = None

    @field_validator("section_titles")
    @classmethod
    def _titles_complete(cls, value: dict[str, str]) -> dict[str, str]:
        _require_locales(value)
        return value

    @field_validator("template")
    @classmethod
    def _template_renders(cls, value: str) -> str:
        try:
            validate_template(value)
        except PromptTemplateError as exc:
            raise ValueError(f"template does not render: {exc}") from exc
        return value


# ---------------------------------------------------------------------------
# Discounts & offers
# ---------------------------------------------------------------------------


class DiscountSeed(_Frozen):
    code: str
    description: Annotated[str, Field(max_length=300)] = ""
    kind: DiscountKind
    value: Annotated[int, Field(gt=0)]
    currency: Annotated[str | None, Field(min_length=3, max_length=3)] = None
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def _code_upper(cls, value: str) -> str:
        if not _CODE_RE.fullmatch(value):
            raise ValueError("discount codes are 3-64 upper-case letters, digits, '-' or '_'")
        return value

    @model_validator(mode="after")
    def _consistent(self) -> DiscountSeed:
        if self.kind == DiscountKind.PERCENT and self.value > 100:
            raise ValueError("percent discounts cannot exceed 100")
        if self.kind == DiscountKind.FIXED and self.currency is None:
            raise ValueError("fixed discounts need a currency")
        return self


class OfferTranslation(_Frozen):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    subtitle: str = ""
    body: str = ""  # markdown
    cta_label: Annotated[str, Field(min_length=1, max_length=80)]


class OfferSeed(_Frozen):
    slug: Slug
    translations: dict[str, OfferTranslation]
    cta_url: SafeUrl = None
    discount_code: str | None = None
    show_banner: bool = True
    is_active: bool = True
    sort_order: int = 0

    @field_validator("translations")
    @classmethod
    def _complete(cls, value: dict[str, OfferTranslation]) -> dict[str, OfferTranslation]:
        _require_locales(value)
        return value


# ---------------------------------------------------------------------------
# Galaxy Library
# ---------------------------------------------------------------------------


class TitleDescription(_Frozen):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    description: str = ""  # markdown


class BookSeed(_Frozen):
    slug: Slug
    translations: dict[str, TitleDescription]
    purchase_url: SafeUrl = None
    is_published: bool = True
    sort_order: int = 0

    @field_validator("translations")
    @classmethod
    def _complete(cls, value: dict[str, TitleDescription]) -> dict[str, TitleDescription]:
        _require_locales(value)
        return value


class SeriesSeed(_Frozen):
    slug: Slug
    translations: dict[str, TitleDescription]
    is_published: bool = True
    sort_order: int = 0
    books: tuple[BookSeed, ...] = ()

    @field_validator("translations")
    @classmethod
    def _complete(cls, value: dict[str, TitleDescription]) -> dict[str, TitleDescription]:
        _require_locales(value)
        return value

    @field_validator("books")
    @classmethod
    def _unique_book_slugs(cls, value: tuple[BookSeed, ...]) -> tuple[BookSeed, ...]:
        slugs = [book.slug for book in value]
        if len(slugs) != len(set(slugs)):
            raise ValueError("book slugs must be unique within a series")
        return value


# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------


class PostTranslation(_Frozen):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    excerpt: Annotated[str, Field(min_length=1, max_length=400)]
    body: NonEmpty  # markdown
    seo_title: Annotated[str, Field(min_length=1, max_length=70)]
    seo_description: Annotated[str, Field(min_length=1, max_length=170)]


class BlogPostSeed(_Frozen):
    slug: Slug
    translations: dict[str, PostTranslation]
    author_name: Annotated[str, Field(min_length=1, max_length=200)] = "Zodiac Blend"
    # Seeded posts are published relative to the seed date so the newest-first order is stable.
    published_days_ago: Annotated[int, Field(ge=0)] = 0

    @field_validator("translations")
    @classmethod
    def _complete(cls, value: dict[str, PostTranslation]) -> dict[str, PostTranslation]:
        _require_locales(value)
        return value
