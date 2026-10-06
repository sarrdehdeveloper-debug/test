"""Request/response models of the public orders API (docs/ARCHITECTURE.md §5)."""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import date, datetime, time
from typing import Annotated, Any, Final, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, StrictInt, field_validator

from app.models import DiscountKind, JobStatus, OrderStatus, SectionStatus

MAX_EMAIL_LENGTH: Final = 254
MAX_LOCALE_LENGTH: Final = 35
MAX_DISCOUNT_CODE_LENGTH: Final = 64
MAX_DISPLAY_NAME_LENGTH: Final = 80
# Generous bound on the raw input before cleaning (cleaning only ever shortens it).
MAX_RAW_DISPLAY_NAME_LENGTH: Final = 400

# ASCII digits only: ``\d`` would also match e.g. Arabic-Indic digits.
_ISO_DATE: Final = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_HH_MM: Final = re.compile(r"([01][0-9]|2[0-3]):([0-5][0-9])")
# Zero-width (non-)joiners are part of correct spelling in Persian/Arabic scripts and emoji.
_KEEP_FORMAT_CHARS: Final = frozenset({"‌", "‍"})


def clean_display_name(value: str) -> str | None:
    """Single-line, printable name: whitespace runs (incl. newlines) collapse to one space; control,
    bidi-override and other invisible format characters are removed. Blank -> ``None``."""
    kept: list[str] = []
    for char in value:
        if char.isspace():
            kept.append(" ")
        elif unicodedata.category(char) in ("Cc", "Cf", "Cs", "Co", "Cn") and char not in _KEEP_FORMAT_CHARS:
            continue
        else:
            kept.append(char)
    cleaned = " ".join("".join(kept).split())
    return cleaned or None


def normalize_discount_code(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().upper()
    return cleaned or None


class _DiscountCodeIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    discount_code: Annotated[str | None, Field(max_length=MAX_DISCOUNT_CODE_LENGTH)] = None

    @field_validator("discount_code", mode="after")
    @classmethod
    def _normalize_code(cls, value: str | None) -> str | None:
        return normalize_discount_code(value)


class QuoteIn(_DiscountCodeIn):
    pass


class DiscountOut(BaseModel):
    code: str
    kind: DiscountKind
    value: int


class QuoteOut(BaseModel):
    list_price_cents: int
    discount_cents: int
    amount_cents: int
    currency: str
    discount: DiscountOut | None


class OrderCreate(_DiscountCodeIn):
    """Body of ``POST /orders``. Date range, time-zone and terms checks have their own error codes."""

    email: EmailStr
    locale: Annotated[str | None, Field(max_length=MAX_LOCALE_LENGTH)] = None
    display_name: Annotated[str | None, Field(max_length=MAX_RAW_DISPLAY_NAME_LENGTH)] = None
    birth_date: date
    birth_time: time
    city_id: Annotated[StrictInt, Field(gt=0, lt=2**63)]  # cities.id is a BIGINT (GeoNames id)
    time_fold: Literal[0, 1] | None = None
    # Consent must be an explicit JSON boolean, never coerced from "yes"/1.
    marketing_opt_in: StrictBool = False
    accept_terms: StrictBool = False

    @field_validator("birth_date", mode="before")
    @classmethod
    def _require_iso_date(cls, value: Any) -> Any:
        # Lax mode would also accept Unix timestamps (0 -> 1970-01-01) and datetimes.
        if isinstance(value, str) and _ISO_DATE.fullmatch(value):
            return value
        raise ValueError("birth_date must be a date in YYYY-MM-DD format")

    @field_validator("birth_time", mode="before")
    @classmethod
    def _require_hh_mm(cls, value: Any) -> Any:
        match = _HH_MM.fullmatch(value) if isinstance(value, str) else None
        if match is None:
            raise ValueError("birth_time must be a time in HH:MM format (00:00-23:59)")
        return time(int(match.group(1)), int(match.group(2)))

    @field_validator("time_fold", mode="before")
    @classmethod
    def _strict_fold(cls, value: Any) -> Any:
        if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
            raise ValueError("time_fold must be null, 0 or 1")
        return value

    @field_validator("email", mode="before")
    @classmethod
    def _limit_email_length(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            if len(value) > MAX_EMAIL_LENGTH:
                raise ValueError(f"email must be at most {MAX_EMAIL_LENGTH} characters")
        return value

    @field_validator("email", mode="after")
    @classmethod
    def _lower_case_email(cls, value: str) -> str:
        return value.lower()

    @field_validator("display_name", mode="after")
    @classmethod
    def _clean_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = clean_display_name(value)
        if cleaned is not None and len(cleaned) > MAX_DISPLAY_NAME_LENGTH:
            raise ValueError(f"display_name must be at most {MAX_DISPLAY_NAME_LENGTH} characters")
        return cleaned


class OrderCreated(BaseModel):
    order_id: uuid.UUID
    access_token: str
    checkout_url: str
    amount_cents: int
    currency: str
    status: OrderStatus


class Progress(BaseModel):
    sections_done: int
    sections_total: int


class OrderSigns(BaseModel):
    sun: str | None = None
    moon: str | None = None
    ascendant: str | None = None
    year_animal: str | None = None
    month_animal: str | None = None
    day_animal: str | None = None


class OrderStatusOut(BaseModel):
    order_id: uuid.UUID
    status: OrderStatus
    locale: str
    email_masked: str
    amount_cents: int
    currency: str
    created_at: datetime
    paid_at: datetime | None
    ready_at: datetime | None
    access_expires_at: datetime | None
    download_available: bool
    progress: Progress
    signs: OrderSigns


class CheckoutOut(BaseModel):
    checkout_url: str


# ---------------------------------------------------------------------------
# Admin (mounted at /api/v1/admin, managers only)
# ---------------------------------------------------------------------------

ADMIN_PAGE_SIZE_MAX: Final = 100
MAX_EXTEND_HOURS: Final = 168


class AdminOrderItem(BaseModel):
    id: uuid.UUID
    status: OrderStatus
    email: str
    amount_cents: int
    currency: str
    created_at: datetime
    paid_at: datetime | None
    ready_at: datetime | None
    locale: str
    discount_code: str | None


class AdminOrderList(BaseModel):
    items: list[AdminOrderItem]
    total: int
    page: int
    page_size: int


class AdminChartSummary(BaseModel):
    calc_version: str
    signs: OrderSigns
    warnings: list[str]
    year_boundary: str | None
    day_boundary: str | None


class AdminSectionOut(BaseModel):
    slot: int
    title: str
    status: SectionStatus
    attempts: int
    word_count: int
    model: str | None
    content: str
    content_truncated: bool
    last_error: str | None
    input_tokens: int | None
    output_tokens: int | None
    updated_at: datetime


class AdminReportOut(BaseModel):
    created_at: datetime
    expires_at: datetime
    email_sent_at: datetime | None
    download_count: int
    last_download_at: datetime | None
    deleted_at: datetime | None
    size_bytes: int


class AdminPaymentEventOut(BaseModel):
    id: int
    provider: str
    event_id: str
    event_type: str
    outcome: str
    received_at: datetime
    data: dict[str, Any]


class AdminJobOut(BaseModel):
    id: int
    kind: str
    status: JobStatus
    attempts: int
    max_attempts: int
    run_at: datetime
    created_at: datetime
    finished_at: datetime | None
    last_error: str | None
    dedupe_key: str | None
    # Only the order reference is exposed: other payload keys may hold secrets (e.g. email tokens).
    order_id: str | None


class AdminJobList(BaseModel):
    items: list[AdminJobOut]
    total: int
    page: int
    page_size: int


class AdminOrderDetail(AdminOrderItem):
    display_name: str | None
    marketing_opt_in: bool
    birth_date: date | None
    birth_time: str | None
    place_label: str | None
    timezone: str | None
    list_price_cents: int
    discount_cents: int
    payment_provider: str
    provider_session_id: str | None
    provider_payment_id: str | None
    updated_at: datetime
    generation_started_at: datetime | None
    last_error: str | None
    personal_data_purged_at: datetime | None
    prompt_version_ids: list[int]
    download_available: bool
    progress: Progress
    chart: AdminChartSummary
    sections: list[AdminSectionOut]
    report: AdminReportOut | None
    payment_events: list[AdminPaymentEventOut]
    jobs: list[AdminJobOut]


class ExtendAccessIn(BaseModel):
    hours: Annotated[StrictInt, Field(ge=1, le=MAX_EXTEND_HOURS)]


class ExtendAccessOut(BaseModel):
    order_id: uuid.UUID
    expires_at: datetime


class RetryGenerationOut(BaseModel):
    order_id: uuid.UUID
    status: OrderStatus
    job_id: int


class ResendEmailOut(BaseModel):
    order_id: uuid.UUID
    job_id: int


class WindowCounts(BaseModel):
    today: int
    last_7_days: int
    last_30_days: int


class DashboardOut(BaseModel):
    orders: WindowCounts  # paid orders (refunded ones excluded)
    revenue_cents: WindowCounts  # in ``currency`` (the configured currency)
    currency: str
    status_counts: dict[str, int]
    free_readings: WindowCounts
    failed_jobs: int
    recent_orders: list[AdminOrderItem]
