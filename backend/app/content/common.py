"""Helpers shared by the content services: pagination, translations, partial updates, errors."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.utils import default_locale, pick_translation, supported_locales

T = TypeVar("T")


def paginate(db: Session, stmt: Select[T], page: int, page_size: int) -> tuple[list[T], int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = list(db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)))
    return items, total


def field_error(field: str, message: str) -> ApiError:
    """A 422 in the same shape FastAPI request validation produces (``details.fields``)."""
    return ApiError(
        422,
        "validation_error",
        "Invalid input",
        {"fields": [{"field": field, "message": message, "type": "value_error"}]},
    )


def flush_or_conflict(db: Session, code: str, message: str) -> None:
    """Flush; a unique-constraint race that slipped past the pre-check becomes a 409."""
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ApiError(409, code, message) from exc


# ---------------------------------------------------------------------------
# Translations: {"en": {"title": ..., ...}, "ar": {...}}
# ---------------------------------------------------------------------------


def _has_title(value: Any) -> bool:
    return isinstance(value, Mapping) and bool(str(value.get("title") or "").strip())


def localized(translations: Mapping[str, Any] | None, locale: str) -> dict[str, Any]:
    """The translation for ``locale`` with default-locale fallback; untitled entries count as missing."""
    usable = {loc: value for loc, value in (translations or {}).items() if _has_title(value)}
    return pick_translation(usable, locale)


def titled_locales(translations: Mapping[str, Any] | None) -> list[str]:
    """Supported locales that have a non-empty title, in configured order."""
    translations = translations or {}
    return [loc for loc in supported_locales() if _has_title(translations.get(loc))]


def text_or_none(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def check_translations(value: dict[str, BaseModel]) -> dict[str, BaseModel]:
    """Validate a translations map from the dashboard (used as a pydantic ``AfterValidator``).

    * keys must be supported locales;
    * an entry whose fields are all blank is dropped (= "not translated", so readers fall back);
    * a partially filled entry needs a title;
    * the default locale needs a title.
    """
    locales = supported_locales()
    unknown = sorted(set(value) - set(locales))
    if unknown:
        raise ValueError(f"Unsupported locale(s): {', '.join(unknown)}; use {', '.join(locales)}")
    cleaned: dict[str, BaseModel] = {}
    for loc, entry in value.items():
        fields = entry.model_dump()
        if not any(fields.values()):
            continue
        if not fields.get("title"):
            raise ValueError(f"Translation '{loc}' needs a title")
        cleaned[loc] = entry
    if default_locale() not in cleaned:
        raise ValueError(f"A title in the default locale ({default_locale()}) is required")
    return {loc: cleaned[loc] for loc in locales if loc in cleaned}


# ---------------------------------------------------------------------------
# Partial updates
# ---------------------------------------------------------------------------


def apply_changes(row: object, changes: Mapping[str, Any]) -> list[str]:
    """Set the given attributes on ``row``; return the sorted names of those whose value changed."""
    changed = []
    for name, value in changes.items():
        if getattr(row, name) != value:
            setattr(row, name, value)
            changed.append(name)
    return sorted(changed)
