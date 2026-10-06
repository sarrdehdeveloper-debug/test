"""All database tables. This module is the single source of truth for the schema.

Conventions
- Timestamps are timezone-aware UTC (``DateTime(timezone=True)``).
- Translatable content uses a JSONB ``translations`` column shaped
  ``{"en": {"title": ..., ...}, "ar": {...}}``; readers fall back to the default locale.
- Money is stored in minor units (cents) as integers, with an ISO-4217 ``currency``.
- Secrets/tokens are never stored raw: only ``sha256`` hex digests (see ``app.security``).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(cls, name=name, values_callable=lambda e: [m.value for m in e], native_enum=False, length=32)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ---------------------------------------------------------------------------
# Admin users, sessions, audit
# ---------------------------------------------------------------------------


class AdminRole(enum.StrEnum):
    OWNER = "owner"  # everything, incl. managing admin users
    ADMIN = "admin"  # everything except managing owners
    EDITOR = "editor"  # content only: blog, library, offers, site content, free readings, media


class AdminUser(TimestampMixin, Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)  # stored lower-case
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[AdminRole] = mapped_column(_enum(AdminRole, "admin_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    totp_secret: Mapped[str | None] = mapped_column(String(64))  # set => MFA required at login
    totp_pending_secret: Mapped[str | None] = mapped_column(String(64))  # during enrollment
    # Last accepted TOTP time step: a code cannot be replayed, even across API processes.
    totp_last_used_step: Mapped[int | None] = mapped_column(BigInteger)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(400))

    user: Mapped[AdminUser] = relationship()


class LoginAttempt(Base):
    """Failed/successful login attempts, used for throttling brute force."""

    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_login_attempts_email_created", "email", "created_at"),
        Index("ix_login_attempts_ip_created", "ip", "created_at"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "prompt.publish"
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_audit_logs_created", "created_at"),)


# ---------------------------------------------------------------------------
# Settings & content
# ---------------------------------------------------------------------------


class Setting(Base):
    """Runtime business settings editable from the dashboard (see app.settings_store)."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SiteContent(Base):
    """Editable text blocks of the public site, e.g. key="home.hero.title", locale="ar"."""

    __tablename__ = "site_content"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    key: Mapped[str] = mapped_column(String(150), nullable=False)
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("key", "locale", name="uq_site_content_key_locale"),)


class FreeReadingKind(enum.StrEnum):
    SIGN = "sign"  # western sun sign: aries..pisces
    ANIMAL = "animal"  # chinese year animal: rat..pig


class FreeReading(TimestampMixin, Base):
    """Pre-written readings served by the free plan (no AI call per visit)."""

    __tablename__ = "free_readings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[FreeReadingKind] = mapped_column(_enum(FreeReadingKind, "free_reading_kind"), nullable=False)
    key: Mapped[str] = mapped_column(String(32), nullable=False)
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")  # markdown

    __table_args__ = (UniqueConstraint("kind", "key", "locale", name="uq_free_reading"),)


class Media(Base):
    __tablename__ = "media"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    file_name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)  # random + ext
    original_name: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    alt: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)  # {locale: alt}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Offer(TimestampMixin, Base):
    """Promotional offer: shown as a banner and on the offers page."""

    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    # {locale: {"title", "subtitle", "body", "cta_label"}}
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    image_url: Mapped[str | None] = mapped_column(String(500))
    cta_url: Mapped[str | None] = mapped_column(String(500))  # default: paid reading page
    discount_code_id: Mapped[int | None] = mapped_column(ForeignKey("discount_codes.id", ondelete="SET NULL"))
    show_banner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    discount_code: Mapped[DiscountCode | None] = relationship()


class DiscountKind(enum.StrEnum):
    PERCENT = "percent"  # value = whole percent 1..100
    FIXED = "fixed"  # value = minor units in `currency`


class DiscountCode(TimestampMixin, Base):
    __tablename__ = "discount_codes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # stored upper-case
    description: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    kind: Mapped[DiscountKind] = mapped_column(_enum(DiscountKind, "discount_kind"), nullable=False)
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str | None] = mapped_column(String(3))  # required for FIXED
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    max_redemptions: Mapped[int | None] = mapped_column(Integer)
    # Counted when an order using the code is PAID (not at checkout creation).
    redemptions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        CheckConstraint("value > 0", name="ck_discount_value_positive"),
        CheckConstraint("kind <> 'percent' OR value <= 100", name="ck_discount_percent_max"),
    )


class BookSeries(TimestampMixin, Base):
    """A series in the "Galaxy Library"."""

    __tablename__ = "book_series"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)  # {title, description}
    cover_image_url: Mapped[str | None] = mapped_column(String(500))
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    books: Mapped[list[Book]] = relationship(
        back_populates="series", order_by="Book.sort_order", cascade="all, delete-orphan"
    )


class Book(TimestampMixin, Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    series_id: Mapped[int] = mapped_column(ForeignKey("book_series.id", ondelete="CASCADE"), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)  # {title, description}
    cover_image_url: Mapped[str | None] = mapped_column(String(500))
    # Selling/shipping is not specified yet: books link out to an external store page.
    purchase_url: Mapped[str | None] = mapped_column(String(500))
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    series: Mapped[BookSeries] = relationship(back_populates="books")

    __table_args__ = (UniqueConstraint("series_id", "slug", name="uq_book_series_slug"),)


class PostStatus(enum.StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class BlogPost(TimestampMixin, Base):
    __tablename__ = "blog_posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    # {locale: {"title", "excerpt", "body" (markdown), "seo_title", "seo_description"}}
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    cover_image_url: Mapped[str | None] = mapped_column(String(500))
    author_name: Mapped[str] = mapped_column(String(200), nullable=False, default="Zodiac Blend")
    status: Mapped[PostStatus] = mapped_column(
        _enum(PostStatus, "post_status"), nullable=False, default=PostStatus.DRAFT
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_blog_posts_status_published", "status", "published_at"),)


# ---------------------------------------------------------------------------
# Prompts (6 slots, versioned)
# ---------------------------------------------------------------------------


class PromptStatus(enum.StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"  # exactly one per slot (partial unique index)
    ARCHIVED = "archived"


class PromptVersion(Base):
    """A version of one of the 6 analysis prompts. Orders snapshot the version ids they used."""

    __tablename__ = "prompt_versions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slot: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..6, defines order in the report
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)  # internal name
    # Section heading shown in the PDF, per locale: {"en": "Your Core Self", "ar": "..."}
    section_titles: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Jinja-style template rendered with the chart variables (see docs/ARCHITECTURE.md).
    template: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional system instruction sent with this prompt.
    system_instruction: Mapped[str] = mapped_column(Text, nullable=False, default="")
    min_words: Mapped[int | None] = mapped_column(Integer)  # None => global setting
    status: Mapped[PromptStatus] = mapped_column(
        _enum(PromptStatus, "prompt_status"), nullable=False, default=PromptStatus.DRAFT
    )
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("slot", "version", name="uq_prompt_slot_version"),
        CheckConstraint("slot BETWEEN 1 AND 6", name="ck_prompt_slot_range"),
        Index(
            "uq_prompt_one_published_per_slot",
            "slot",
            unique=True,
            postgresql_where=text("status = 'published'"),
        ),
    )


# ---------------------------------------------------------------------------
# Geography
# ---------------------------------------------------------------------------


class Country(Base):
    __tablename__ = "countries"

    code: Mapped[str] = mapped_column(String(2), primary_key=True)  # ISO-3166 alpha-2
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    names: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)  # {locale: name}
    capital: Mapped[str | None] = mapped_column(String(200))
    timezones: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)


class City(Base):
    __tablename__ = "cities"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # GeoNames id
    country_code: Mapped[str] = mapped_column(ForeignKey("countries.code"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ascii_name: Mapped[str] = mapped_column(String(200), nullable=False)  # lower-case, for search
    # Lower-cased name + ascii name + alternate names in all scripts (e.g. "القاهرة"), for search.
    search_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    names: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)  # {locale: name}
    admin1: Mapped[str | None] = mapped_column(String(200))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)  # IANA
    population: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    is_capital: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("ix_cities_country_ascii", "country_code", "ascii_name"),
        Index("ix_cities_capital", "country_code", postgresql_where=text("is_capital")),
    )


# ---------------------------------------------------------------------------
# Free plan leads
# ---------------------------------------------------------------------------


class FreeReadingRequest(Base):
    __tablename__ = "free_reading_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date)  # purged by retention job
    sun_sign: Mapped[str] = mapped_column(String(32), nullable=False)
    year_animal: Mapped[str] = mapped_column(String(32), nullable=False)
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_free_requests_created", "created_at"),)


# ---------------------------------------------------------------------------
# Orders, payments, jobs, reports
# ---------------------------------------------------------------------------


class OrderStatus(enum.StrEnum):
    AWAITING_PAYMENT = "awaiting_payment"
    PAID = "paid"
    QUEUED = "queued"
    GENERATING = "generating"
    READY = "ready"
    GENERATION_FAILED = "generation_failed"
    EXPIRED = "expired"  # report access window elapsed (file deleted)
    ABANDONED = "abandoned"  # never paid, cleaned up
    REFUNDED = "refunded"


class Order(TimestampMixin, Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[OrderStatus] = mapped_column(
        _enum(OrderStatus, "order_status"), nullable=False, default=OrderStatus.AWAITING_PAYMENT
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Birth data (purged by retention job; chart keeps only derived results)
    birth_date: Mapped[date | None] = mapped_column(Date)
    birth_time: Mapped[time | None] = mapped_column(Time)
    time_fold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # PEP 495 fold for DST overlap
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id", ondelete="SET NULL"))
    place_label: Mapped[str | None] = mapped_column(String(300))  # "Cairo, Egypt"
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    timezone: Mapped[str | None] = mapped_column(String(64))
    birth_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Calculation results, see app.charts.schemas.Chart
    chart: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    calc_version: Mapped[str] = mapped_column(String(32), nullable=False)

    # Pricing
    list_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_code_id: Mapped[int | None] = mapped_column(ForeignKey("discount_codes.id", ondelete="SET NULL"))
    discount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    # Payment
    payment_provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_session_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(255))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Generation
    prompt_version_ids: Mapped[list[int]] = mapped_column(JSONB, nullable=False, default=list)
    generation_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)

    # Browser access token (returned once at order creation, kept by the browser)
    access_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    personal_data_purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    discount_code: Mapped[DiscountCode | None] = relationship()
    sections: Mapped[list[ReportSection]] = relationship(back_populates="order", order_by="ReportSection.slot")
    report: Mapped[Report | None] = relationship(back_populates="order", uselist=False)

    __table_args__ = (
        Index("ix_orders_status_created", "status", "created_at"),
        Index("ix_orders_email", "email"),
        Index("ix_orders_provider_payment_id", "provider_payment_id"),
        CheckConstraint("amount_cents >= 0", name="ck_order_amount_nonneg"),
    )


class PaymentEvent(Base):
    """Every webhook event received; ``(provider, event_id)`` makes processing idempotent."""

    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)  # minimal, no card data
    outcome: Mapped[str] = mapped_column(String(64), nullable=False, default="received")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_payment_event"),)


class JobStatus(enum.StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"  # exhausted attempts


class Job(Base):
    """PostgreSQL-backed durable job queue (claimed with FOR UPDATE SKIP LOCKED).

    Jobs are inserted in the same transaction as the state change that requires them
    (transactional outbox), so a paid order can never lose its generation job.
    """

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    status: Mapped[JobStatus] = mapped_column(_enum(JobStatus, "job_status"), nullable=False, default=JobStatus.PENDING)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    locked_by: Mapped[str | None] = mapped_column(String(100))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_jobs_claim", "status", "run_at"),
        Index("ix_jobs_payload_order_id", text("(payload->>'order_id')")),
    )


class SectionStatus(enum.StrEnum):
    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"


class ReportSection(TimestampMixin, Base):
    """Result of one of the 6 prompts for an order. Successful sections are never re-generated."""

    __tablename__ = "report_sections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    slot: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt_version_id: Mapped[int | None] = mapped_column(ForeignKey("prompt_versions.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")  # markdown from the model
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[SectionStatus] = mapped_column(
        _enum(SectionStatus, "section_status"), nullable=False, default=SectionStatus.PENDING
    )
    model: Mapped[str | None] = mapped_column(String(100))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    last_error: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="sections")

    __table_args__ = (UniqueConstraint("order_id", "slot", name="uq_report_section_order_slot"),)


class Report(Base):
    """The generated PDF. ``file_key`` is the random 64-hex-char file name in private storage."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    file_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    # Second access token, generated when the email is sent and only included in the email.
    # Re-sending the email rotates it. (Only the hash is stored.)
    email_token_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    download_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_download_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="report")

    __table_args__ = (Index("ix_reports_expires", "expires_at"),)
