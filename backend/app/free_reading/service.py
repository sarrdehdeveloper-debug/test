"""Free plan: signs from the birth date, pre-written readings, and the lead record.

No AI call happens here: readings are written by editors (``free_readings`` table) and served
in the visitor's locale, falling back to the default locale per reading.
"""

from __future__ import annotations

from typing import Final, get_args

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.charts.schemas import FreeSigns, YearBoundary
from app.charts.service import BirthDateOutOfRange, free_signs
from app.errors import ApiError
from app.free_reading.schemas import FreeReadingIn, FreeReadingResult, ReadingOut
from app.markdown import render_markdown
from app.models import FreeReading, FreeReadingKind, FreeReadingRequest
from app.ratelimit import limiter
from app.settings_store import DEFAULTS, get_setting
from app.utils import default_locale, ip_hash, normalize_locale

RATE_LIMIT_WINDOW_SECONDS: Final = 3600


def enforce_rate_limit(db: Session, ip: str) -> None:
    """Count one free reading for ``ip``; raise ``ApiError(429)`` once the hourly limit is reached."""
    limit = get_setting(db, "free_reading_rate_limit_per_hour")
    limiter.hit(f"free-reading:{ip}", limit, RATE_LIMIT_WINDOW_SECONDS)


def current_year_boundary(db: Session) -> YearBoundary:
    value = get_setting(db, "chinese_year_boundary")
    # Settings are validated on write; this only guards against a hand-edited row.
    return value if value in get_args(YearBoundary) else DEFAULTS["chinese_year_boundary"]


def compute_signs(db: Session, payload: FreeReadingIn) -> FreeSigns:
    try:
        return free_signs(payload.birth_date, year_boundary=current_year_boundary(db))
    except BirthDateOutOfRange as exc:
        raise ApiError(
            422,
            "birth_date_out_of_range",
            "Please enter a birth date from 1900 onwards, and not in the future.",
            {"min_date": exc.earliest.isoformat(), "max_date": exc.latest.isoformat()},
        ) from None


def find_readings(db: Session, signs: FreeSigns, locale: str) -> tuple[ReadingOut | None, ReadingOut | None]:
    """The sign and animal readings in ``locale``, each falling back to the default locale."""
    wanted = {FreeReadingKind.SIGN: signs.sun_sign, FreeReadingKind.ANIMAL: signs.year_animal}
    preference = list(dict.fromkeys([locale, default_locale()]))
    rows = db.scalars(
        select(FreeReading).where(
            or_(*(and_(FreeReading.kind == kind, FreeReading.key == key) for kind, key in wanted.items())),
            FreeReading.locale.in_(preference),
        )
    ).all()
    return (
        _best_reading(rows, FreeReadingKind.SIGN, preference),
        _best_reading(rows, FreeReadingKind.ANIMAL, preference),
    )


def record_request(db: Session, payload: FreeReadingIn, locale: str, signs: FreeSigns, ip: str) -> FreeReadingRequest:
    """Store the lead (caller commits). Only a pseudonymised hash of the IP is kept."""
    row = FreeReadingRequest(
        email=payload.email,
        locale=locale,
        birth_date=payload.birth_date,
        sun_sign=signs.sun_sign,
        year_animal=signs.year_animal,
        marketing_opt_in=payload.marketing_opt_in,
        ip_hash=ip_hash(ip),
    )
    db.add(row)
    db.flush()
    return row


def create_free_reading(db: Session, payload: FreeReadingIn, ip: str) -> FreeReadingResult:
    """Rate-limit, compute the signs, store the lead and return the readings (caller commits)."""
    enforce_rate_limit(db, ip)
    locale = normalize_locale(payload.locale)
    signs = compute_signs(db, payload)
    record_request(db, payload, locale, signs, ip)
    sign_reading, animal_reading = find_readings(db, signs, locale)
    return FreeReadingResult(signs=signs, sign_reading=sign_reading, animal_reading=animal_reading)


def _best_reading(rows: list[FreeReading], kind: FreeReadingKind, preference: list[str]) -> ReadingOut | None:
    # A row with an empty body is an untranslated placeholder: fall back instead of showing nothing.
    usable = {row.locale: row for row in rows if row.kind == kind and row.body.strip()}
    for locale in preference:
        row = usable.get(locale)
        if row is not None:
            return ReadingOut(key=row.key, title=row.title, body_html=render_markdown(row.body))
    return None
