"""Runtime business settings stored in the ``settings`` table, with typed defaults.

Every key must be declared in ``DEFAULTS``; unknown keys are rejected on write.
Read with ``get_setting(db, "paid_price_cents")`` or ``get_all_settings(db)``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Setting

DEFAULTS: dict[str, Any] = {
    # Pricing for the paid report
    "paid_price_cents": 2900,
    "currency": "USD",
    # Generation pipeline
    "gemini_model": "gemini-2.5-flash",
    "gemini_temperature": 0.9,
    "gemini_max_output_tokens": 8192,  # 350-550 words in Arabic + thinking tokens need headroom
    "gemini_timeout_seconds": 60,
    "prompt_delay_min_seconds": 1.0,  # pause between consecutive prompts (client: 1-2 s)
    "prompt_delay_max_seconds": 2.0,
    "min_words": 25,  # a reply shorter than this is re-requested (client requirement)
    "max_attempts_per_prompt": 3,
    # Report delivery
    "report_access_hours": 24,  # starts when the report becomes ready
    "email_attach_pdf": False,  # True => also attach the PDF to the email (cannot expire)
    # Calculation method (needs client confirmation; stored on every order's chart)
    "chinese_year_boundary": "lichun",  # "lichun" (BaZi) | "lunar_new_year" (popular zodiac)
    "chinese_day_boundary": "midnight",  # "midnight" | "zi_23" (day starts 23:00)
    # Privacy / retention
    "personal_data_retention_days": 30,  # birth data purged from orders/leads after this
    "abandoned_order_hours": 48,  # unpaid orders are marked abandoned after this
    # Abuse protection
    "free_reading_rate_limit_per_hour": 30,
    "order_rate_limit_per_hour": 20,
}

_VALIDATORS: dict[str, Any] = {
    "paid_price_cents": lambda v: isinstance(v, int) and 50 <= v <= 1_000_000,
    "currency": lambda v: isinstance(v, str) and len(v) == 3 and v.isalpha(),
    "gemini_model": lambda v: isinstance(v, str) and 0 < len(v) <= 100,
    "gemini_temperature": lambda v: isinstance(v, (int, float)) and 0 <= v <= 2,
    "gemini_max_output_tokens": lambda v: isinstance(v, int) and 64 <= v <= 65536,
    "gemini_timeout_seconds": lambda v: isinstance(v, int) and 5 <= v <= 600,
    "prompt_delay_min_seconds": lambda v: isinstance(v, (int, float)) and 0 <= v <= 30,
    "prompt_delay_max_seconds": lambda v: isinstance(v, (int, float)) and 0 <= v <= 30,
    "min_words": lambda v: isinstance(v, int) and 0 <= v <= 5000,
    "max_attempts_per_prompt": lambda v: isinstance(v, int) and 1 <= v <= 10,
    "report_access_hours": lambda v: isinstance(v, int) and 1 <= v <= 24 * 30,
    "email_attach_pdf": lambda v: isinstance(v, bool),
    "chinese_year_boundary": lambda v: v in ("lichun", "lunar_new_year"),
    "chinese_day_boundary": lambda v: v in ("midnight", "zi_23"),
    "personal_data_retention_days": lambda v: isinstance(v, int) and 1 <= v <= 3650,
    "abandoned_order_hours": lambda v: isinstance(v, int) and 1 <= v <= 24 * 30,
    "free_reading_rate_limit_per_hour": lambda v: isinstance(v, int) and 1 <= v <= 100_000,
    "order_rate_limit_per_hour": lambda v: isinstance(v, int) and 1 <= v <= 100_000,
}


class InvalidSetting(ValueError):
    pass


def get_all_settings(db: Session) -> dict[str, Any]:
    values = dict(DEFAULTS)
    for row in db.scalars(select(Setting)):
        if row.key in DEFAULTS:
            values[row.key] = row.value
    return values


def get_setting(db: Session, key: str) -> Any:
    if key not in DEFAULTS:
        raise KeyError(key)
    row = db.get(Setting, key)
    return DEFAULTS[key] if row is None else row.value


def validate_setting(key: str, value: Any) -> Any:
    if key not in DEFAULTS:
        raise InvalidSetting(f"Unknown setting: {key}")
    # Allow ints where floats are expected and vice versa for whole numbers.
    if isinstance(DEFAULTS[key], float) and isinstance(value, int) and not isinstance(value, bool):
        value = float(value)
    if isinstance(DEFAULTS[key], bool) != isinstance(value, bool):
        raise InvalidSetting(f"Invalid value for {key}")
    if not _VALIDATORS[key](value):
        raise InvalidSetting(f"Invalid value for {key}")
    return value


def set_settings(db: Session, updates: dict[str, Any]) -> dict[str, Any]:
    """Validate and upsert several settings (caller commits). Returns the full settings map."""
    cleaned = {k: validate_setting(k, v) for k, v in updates.items()}
    merged = {**get_all_settings(db), **cleaned}
    if merged["prompt_delay_min_seconds"] > merged["prompt_delay_max_seconds"]:
        raise InvalidSetting("prompt_delay_min_seconds must be <= prompt_delay_max_seconds")
    for key, value in cleaned.items():
        row = db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=value))
        else:
            row.value = value
    db.flush()
    return merged
