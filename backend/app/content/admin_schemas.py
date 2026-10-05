"""Request/response models of the content admin API (docs/ARCHITECTURE.md §6).

Single-field rules live here; rules that span fields or need the stored row (date windows,
discount kind/value/currency, uniqueness) are checked in the services so partial updates are
validated against the merged result.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, ClassVar, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
)

from app.content.common import check_translations, titled_locales
from app.content.keys import KEYS_BY_NAME, SITE_CONTENT_KEYS
from app.content.schemas import (
    DbId,
    Excerpt,
    Label,
    LinkUrl,
    LongMarkdown,
    Markdown,
    PageQuery,
    PostSlug,
    ShortText,
    Slug,
    SortOrder,
    SupportedLocale,
    Title,
    UtcDatetime,
    reject_nul,
)
from app.models import (
    BlogPost,
    Book,
    BookSeries,
    DiscountCode,
    DiscountKind,
    FreeReadingKind,
    Offer,
    PostStatus,
)
from app.utils import default_locale

_CODE_RE = re.compile(r"[A-Z0-9_-]{3,64}")
_CURRENCY_RE = re.compile(r"[A-Z]{3}")
MAX_CONTENT_VALUE_LENGTH = 20_000
MAX_PREVIEW_LENGTH = 100_000


def _check_code(value: str) -> str:
    if not _CODE_RE.fullmatch(value):
        raise ValueError("Use 3-64 characters: letters, digits, '-' or '_'")
    return value


def _check_currency(value: str) -> str:
    if not _CURRENCY_RE.fullmatch(value):
        raise ValueError("Use a 3-letter ISO currency code")
    return value


DiscountCodeValue = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True), AfterValidator(_check_code)]
Currency = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True), AfterValidator(_check_currency)]
AuthorName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200), AfterValidator(reject_nul)
]
ContentValue = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=MAX_CONTENT_VALUE_LENGTH), AfterValidator(reject_nul)
]


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Patch(_Input):
    """Partial update: omitted fields keep their value; ``null`` is accepted only for ``NULLABLE`` fields."""

    NULLABLE: ClassVar[frozenset[str]] = frozenset()

    @field_validator("*", mode="before")
    @classmethod
    def _null_only_where_allowed(cls, value: Any, info: ValidationInfo) -> Any:
        if value is None and info.field_name not in cls.NULLABLE:
            raise ValueError("Field cannot be null; omit it to keep the current value")
        return value

    def changes(self) -> dict[str, Any]:
        """The fields the client sent, as plain Python values (nested models become dicts)."""
        return self.model_dump(include=self.model_fields_set)


class _Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DeleteOut(BaseModel):
    deleted: bool = True


class HtmlOut(BaseModel):
    html: str


# ---------------------------------------------------------------------------
# Site content & free readings
# ---------------------------------------------------------------------------


class ContentKeyOut(BaseModel):
    key: str
    format: str
    group: str
    description: str


CONTENT_KEYS_OUT: list[ContentKeyOut] = [ContentKeyOut(**k._asdict()) for k in SITE_CONTENT_KEYS]


class SiteContentAdminOut(BaseModel):
    locale: str
    items: dict[str, str]
    keys: list[ContentKeyOut]


class SiteContentUpdate(_Input):
    locale: SupportedLocale
    items: Annotated[dict[str, ContentValue], Field(max_length=len(SITE_CONTENT_KEYS))]

    @field_validator("items")
    @classmethod
    def _known_keys(cls, value: dict[str, str]) -> dict[str, str]:
        unknown = sorted(key for key in value if key not in KEYS_BY_NAME)
        if unknown:
            shown = ", ".join(key[:100] for key in unknown[:10])
            raise ValueError(f"Unknown content key(s): {shown}")
        return value


class FreeReadingIn(_Input):
    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300), AfterValidator(reject_nul)
    ]
    body: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000), AfterValidator(reject_nul)
    ]


class FreeReadingOut(BaseModel):
    id: int | None
    kind: FreeReadingKind
    key: str
    locale: str
    title: str
    body: str
    updated_at: datetime | None


class FreeReadingQuery(BaseModel):
    kind: FreeReadingKind | None = None
    locale: SupportedLocale | None = None


# ---------------------------------------------------------------------------
# Offers
# ---------------------------------------------------------------------------


class OfferTranslationIn(_Input):
    title: Title = ""
    subtitle: ShortText = ""
    body: Markdown = ""
    cta_label: Label = ""


OfferTranslations = Annotated[dict[str, OfferTranslationIn], AfterValidator(check_translations)]


class OfferCreate(_Input):
    slug: Slug
    translations: OfferTranslations
    image_url: LinkUrl | None = None
    cta_url: LinkUrl | None = None
    discount_code_id: DbId | None = None
    show_banner: bool = True
    is_active: bool = True
    starts_at: UtcDatetime | None = None
    ends_at: UtcDatetime | None = None
    sort_order: SortOrder = 0


class OfferUpdate(_Patch):
    NULLABLE = frozenset({"image_url", "cta_url", "discount_code_id", "starts_at", "ends_at"})

    slug: Slug | None = None
    translations: OfferTranslations | None = None
    image_url: LinkUrl | None = None
    cta_url: LinkUrl | None = None
    discount_code_id: DbId | None = None
    show_banner: bool | None = None
    is_active: bool | None = None
    starts_at: UtcDatetime | None = None
    ends_at: UtcDatetime | None = None
    sort_order: SortOrder | None = None


class OfferAdminOut(_Output):
    id: int
    slug: str
    translations: dict[str, Any]
    image_url: str | None
    cta_url: str | None
    discount_code_id: int | None
    discount_code: str | None
    show_banner: bool
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    sort_order: int
    is_live: bool  # active and inside its date window right now
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, offer: Offer, *, is_live: bool) -> Self:
        return cls(
            id=offer.id,
            slug=offer.slug,
            translations=offer.translations or {},
            image_url=offer.image_url,
            cta_url=offer.cta_url,
            discount_code_id=offer.discount_code_id,
            discount_code=offer.discount_code.code if offer.discount_code else None,
            show_banner=offer.show_banner,
            is_active=offer.is_active,
            starts_at=offer.starts_at,
            ends_at=offer.ends_at,
            sort_order=offer.sort_order,
            is_live=is_live,
            created_at=offer.created_at,
            updated_at=offer.updated_at,
        )


# ---------------------------------------------------------------------------
# Discounts
# ---------------------------------------------------------------------------

DiscountValue = Annotated[int, Field(ge=1, le=100_000_000)]
MaxRedemptions = Annotated[int, Field(ge=1, le=1_000_000_000)]


class DiscountCreate(_Input):
    code: DiscountCodeValue
    description: ShortText = ""
    kind: DiscountKind
    value: DiscountValue
    currency: Currency | None = None
    is_active: bool = True
    starts_at: UtcDatetime | None = None
    ends_at: UtcDatetime | None = None
    max_redemptions: MaxRedemptions | None = None


class DiscountUpdate(_Patch):
    NULLABLE = frozenset({"currency", "starts_at", "ends_at", "max_redemptions"})

    code: DiscountCodeValue | None = None
    description: ShortText | None = None
    kind: DiscountKind | None = None
    value: DiscountValue | None = None
    currency: Currency | None = None
    is_active: bool | None = None
    starts_at: UtcDatetime | None = None
    ends_at: UtcDatetime | None = None
    max_redemptions: MaxRedemptions | None = None


class DiscountOut(_Output):
    id: int
    code: str
    description: str
    kind: DiscountKind
    value: int
    currency: str | None
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    max_redemptions: int | None
    redemptions_count: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, discount: DiscountCode) -> Self:
        return cls.model_validate(discount)


class DiscountDeleteOut(BaseModel):
    deleted: bool
    deactivated: bool


# ---------------------------------------------------------------------------
# Galaxy Library
# ---------------------------------------------------------------------------


class LibraryTranslationIn(_Input):
    title: Title = ""
    description: Markdown = ""


LibraryTranslations = Annotated[dict[str, LibraryTranslationIn], AfterValidator(check_translations)]


class SeriesCreate(_Input):
    slug: Slug
    translations: LibraryTranslations
    cover_image_url: LinkUrl | None = None
    is_published: bool = False
    sort_order: SortOrder = 0


class SeriesUpdate(_Patch):
    NULLABLE = frozenset({"cover_image_url"})

    slug: Slug | None = None
    translations: LibraryTranslations | None = None
    cover_image_url: LinkUrl | None = None
    is_published: bool | None = None
    sort_order: SortOrder | None = None


class BookCreate(_Input):
    slug: Slug
    translations: LibraryTranslations
    cover_image_url: LinkUrl | None = None
    purchase_url: LinkUrl | None = None
    is_published: bool = False
    sort_order: SortOrder = 0


class BookUpdate(_Patch):
    NULLABLE = frozenset({"cover_image_url", "purchase_url"})

    slug: Slug | None = None
    translations: LibraryTranslations | None = None
    cover_image_url: LinkUrl | None = None
    purchase_url: LinkUrl | None = None
    is_published: bool | None = None
    sort_order: SortOrder | None = None


class BookAdminOut(_Output):
    id: int
    series_id: int
    slug: str
    translations: dict[str, Any]
    cover_image_url: str | None
    purchase_url: str | None
    is_published: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, book: Book) -> Self:
        return cls.model_validate(book)


class SeriesAdminOut(BaseModel):
    id: int
    slug: str
    translations: dict[str, Any]
    cover_image_url: str | None
    is_published: bool
    sort_order: int
    books_count: int
    books: list[BookAdminOut]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, series: BookSeries) -> Self:
        books = sorted(series.books, key=lambda b: (b.sort_order, b.id))
        return cls(
            id=series.id,
            slug=series.slug,
            translations=series.translations or {},
            cover_image_url=series.cover_image_url,
            is_published=series.is_published,
            sort_order=series.sort_order,
            books_count=len(books),
            books=[BookAdminOut.from_row(b) for b in books],
            created_at=series.created_at,
            updated_at=series.updated_at,
        )


# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------


class PostTranslationIn(_Input):
    title: Title = ""
    excerpt: Excerpt = ""
    body: LongMarkdown = ""
    seo_title: Title = ""
    seo_description: ShortText = ""


PostTranslations = Annotated[dict[str, PostTranslationIn], AfterValidator(check_translations)]


class PostCreate(_Input):
    slug: PostSlug
    translations: PostTranslations
    cover_image_url: LinkUrl | None = None
    author_name: AuthorName = "Zodiac Blend"


class PostUpdate(_Patch):
    # published_at may be moved (e.g. scheduled in the future: hidden publicly until then).
    NULLABLE = frozenset({"cover_image_url", "published_at"})

    slug: PostSlug | None = None
    translations: PostTranslations | None = None
    cover_image_url: LinkUrl | None = None
    author_name: AuthorName | None = None
    published_at: UtcDatetime | None = None


class PostListQuery(PageQuery):
    status: PostStatus | None = None


class PostAdminSummary(BaseModel):
    id: int
    slug: str
    status: PostStatus
    title: str
    author_name: str
    cover_image_url: str | None
    published_at: datetime | None
    available_locales: list[str]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, post: BlogPost) -> Self:
        default = (post.translations or {}).get(default_locale()) or {}
        return cls(
            id=post.id,
            slug=post.slug,
            status=post.status,
            title=str(default.get("title") or ""),
            author_name=post.author_name,
            cover_image_url=post.cover_image_url,
            published_at=post.published_at,
            available_locales=titled_locales(post.translations),
            created_at=post.created_at,
            updated_at=post.updated_at,
        )


class PostAdminOut(PostAdminSummary):
    translations: dict[str, Any]

    @classmethod
    def from_row(cls, post: BlogPost) -> Self:
        summary = PostAdminSummary.from_row(post).model_dump()
        return cls(**summary, translations=post.translations or {})


# ---------------------------------------------------------------------------
# Media, markdown, settings
# ---------------------------------------------------------------------------


class MediaOut(BaseModel):
    id: int
    url: str
    file_name: str
    original_name: str
    content_type: str
    size_bytes: int
    width: int | None
    height: int | None
    alt: dict[str, Any]
    created_at: datetime


class LocaleQuery(BaseModel):
    locale: SupportedLocale | None = None


class MarkdownPreviewIn(_Input):
    markdown: Annotated[str, Field(max_length=MAX_PREVIEW_LENGTH), AfterValidator(reject_nul)]


class SettingsOut(BaseModel):
    values: dict[str, Any]
    defaults: dict[str, Any]


class SettingsUpdate(_Input):
    values: Annotated[dict[str, Any], Field(max_length=100)]
