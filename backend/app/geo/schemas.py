"""Request/response models of the public geo API (see docs/ARCHITECTURE.md §5)."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

MAX_QUERY_LENGTH = 100
MAX_CITY_LIMIT = 50


class LocaleQuery(BaseModel):
    """``?locale=``; unknown values fall back to the default locale (``utils.normalize_locale``)."""

    model_config = ConfigDict(extra="ignore")

    locale: str | None = None


class CitySearchQuery(LocaleQuery):
    country: Annotated[str, Field(description="ISO 3166-1 alpha-2 country code, e.g. EG")]
    q: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=MAX_QUERY_LENGTH)] = None
    limit: Annotated[int, Field(ge=1, le=MAX_CITY_LIMIT)] = 20

    @field_validator("country", mode="before")
    @classmethod
    def _normalize_country(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip().upper()
            if len(value) != 2 or not value.isascii() or not value.isalpha():
                raise ValueError("country must be an ISO 3166-1 alpha-2 code")
        return value


class CountryOut(BaseModel):
    code: str
    name: str  # localised (falls back to English)
    name_en: str
    timezones: list[str]
    capital_city_id: int | None


class CountryList(BaseModel):
    items: list[CountryOut]


class CityOut(BaseModel):
    id: int
    name: str
    admin1: str | None
    country_code: str
    timezone: str
    latitude: float
    longitude: float
    population: int
    is_capital: bool
    label: str  # "Cairo, Egypt" / "Austin, Texas, United States", country name localised


class CityList(BaseModel):
    items: list[CityOut]
