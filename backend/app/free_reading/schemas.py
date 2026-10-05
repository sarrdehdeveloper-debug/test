"""Request/response models of the free plan API (docs/ARCHITECTURE.md §5, ``POST /free-reading``)."""

from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Any, Final

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, field_validator

from app.charts.schemas import FreeSigns

# RFC 5321 limits a forward path to 256 octets including the angle brackets.
MAX_EMAIL_LENGTH: Final = 254
# Long enough for any BCP 47 tag a browser sends (e.g. "zh-Hant-TW-u-nu-hanidec").
MAX_LOCALE_LENGTH: Final = 35

# ASCII digits only: ``\d`` would also match e.g. Arabic-Indic digits.
_ISO_DATE: Final = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class FreeReadingIn(BaseModel):
    """Body of ``POST /free-reading``. The date range is checked by the handler (own error code)."""

    model_config = ConfigDict(extra="ignore")

    birth_date: date
    email: EmailStr
    locale: Annotated[str | None, Field(max_length=MAX_LOCALE_LENGTH)] = None
    # Consent must be an explicit JSON boolean, never coerced from "yes"/1.
    marketing_opt_in: StrictBool = False

    @field_validator("birth_date", mode="before")
    @classmethod
    def _require_iso_date(cls, value: Any) -> Any:
        # Pydantic's lax mode would also accept Unix timestamps (0 -> 1970-01-01) and datetimes.
        if isinstance(value, str) and _ISO_DATE.fullmatch(value):
            return value
        raise ValueError("birth_date must be a date in YYYY-MM-DD format")

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


class ReadingOut(BaseModel):
    key: str  # sign ("leo") or animal ("horse") key
    title: str  # plain text
    body_html: str  # sanitised HTML rendered from the stored Markdown


class FreeReadingResult(BaseModel):
    signs: FreeSigns
    sign_reading: ReadingOut | None
    animal_reading: ReadingOut | None
