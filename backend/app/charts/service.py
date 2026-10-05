"""Compose a full birth chart (Western + Chinese) and the date-only free-plan signs.

Contract: docs/ARCHITECTURE.md §4.4. The heavy lifting lives in :mod:`app.astro` and
:mod:`app.chinese`; this module resolves the birth wall time, validates the supported range and
records machine-readable warnings about results that depend on an uncertain birth time.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Final, get_args

from app.astro.timezones import AmbiguousLocalTime, ResolvedTime, resolve_local_time
from app.astro.western import compute_western, sun_sign_for_date
from app.charts.schemas import Chart, ChartInput, DayBoundary, FreeSigns, YearBoundary
from app.chinese.bazi import compute_chinese, year_pillar_for_date
from app.chinese.solar_terms import nearest_jie
from app.utils import utcnow

MIN_BIRTH_DATE: Final = date(1900, 1, 1)

# The calendar date is "today" somewhere on Earth until it is over at UTC+14 (Line Islands), so a
# visitor there must not be told their birthday is in the future.
_EARLIEST_CIVIL_OFFSET: Final = timedelta(hours=14)

# A birth this close to a month-changing solar term may fall in the other month (or year) pillar if
# the recorded birth time is slightly off.
SOLAR_TERM_WARNING_WINDOW: Final = timedelta(hours=2)

WARNING_SUN_ON_CUSP: Final = "sun_on_cusp"
WARNING_NEAR_SOLAR_TERM: Final = "near_solar_term_boundary"
WARNING_AMBIGUOUS_TIME_RESOLVED: Final = "ambiguous_time_resolved"


class BirthDateOutOfRange(ValueError):
    """The birth date (or instant) is outside 1900-01-01 … today.

    The message never contains the birth date itself, so it is safe to log.
    """

    def __init__(self, earliest: date, latest: date) -> None:
        super().__init__(f"birth date must be between {earliest.isoformat()} and {latest.isoformat()}")
        self.earliest = earliest
        self.latest = latest


@dataclass(frozen=True, slots=True)
class Place:
    latitude: float  # degrees, north-positive
    longitude: float  # degrees, east-positive
    timezone: str  # IANA name, e.g. "Africa/Cairo"
    label: str  # human-readable, e.g. "Cairo, Egypt"


def latest_birth_date() -> date:
    """The latest supported birth date: the calendar date at UTC+14 right now."""
    return (utcnow() + _EARLIEST_CIVIL_OFFSET).date()


def validate_birth_date(birth_date: date) -> None:
    """Raise :class:`BirthDateOutOfRange` unless ``MIN_BIRTH_DATE <= birth_date <= today``."""
    if isinstance(birth_date, datetime) or not isinstance(birth_date, date):
        raise TypeError("birth_date must be a date")
    latest = latest_birth_date()
    if not MIN_BIRTH_DATE <= birth_date <= latest:
        raise BirthDateOutOfRange(MIN_BIRTH_DATE, latest)


def build_chart(
    birth_date: date,
    birth_time: time,
    place: Place,
    *,
    fold: int | None,
    year_boundary: YearBoundary,
    day_boundary: DayBoundary,
) -> Chart:
    """Full chart for a birth at a wall-clock time and place.

    ``fold`` picks the occurrence of a repeated wall time (0 = earlier, 1 = later); with ``None`` an
    ambiguous time raises :class:`~app.astro.timezones.AmbiguousLocalTime`. A skipped wall time always
    raises :class:`~app.astro.timezones.NonexistentLocalTime`. Both propagate unchanged so the API can
    ask the visitor. Raises :class:`BirthDateOutOfRange` for dates outside 1900-01-01 … today or a
    birth instant in the future, and ``ValueError`` for invalid place, fold or convention values.
    """
    validate_birth_date(birth_date)
    _validate_year_boundary(year_boundary)
    _validate_day_boundary(day_boundary)
    _validate_place(place)
    resolved, fold_was_needed = _resolve_birth_time(birth_date, birth_time, place.timezone, fold)
    if resolved.utc > utcnow():
        raise BirthDateOutOfRange(MIN_BIRTH_DATE, latest_birth_date())

    western = compute_western(resolved.utc, place.latitude, place.longitude)
    chinese = compute_chinese(resolved.local, year_boundary, day_boundary)

    warnings: list[str] = []
    if fold_was_needed:
        warnings.append(WARNING_AMBIGUOUS_TIME_RESOLVED)
    if western.sun_on_cusp:
        warnings.append(WARNING_SUN_ON_CUSP)
    if is_near_solar_term(resolved.utc):
        warnings.append(WARNING_NEAR_SOLAR_TERM)

    return Chart(
        input=_chart_input(resolved, place),
        western=western,
        chinese=chinese,
        warnings=warnings,
    )


def free_signs(birth_date: date, *, year_boundary: YearBoundary) -> FreeSigns:
    """Sun sign and Chinese year animal from the birth date alone (free plan).

    Without a birth time and place the Sun's sign or the Chinese year can be undecidable on the day
    the boundary is crossed; the other candidate is then reported as the ``*_alternative``.
    """
    validate_birth_date(birth_date)
    _validate_year_boundary(year_boundary)
    sun_sign, sun_alternative = sun_sign_for_date(birth_date)
    year_pillar, animal_alternative = year_pillar_for_date(birth_date, year_boundary)
    return FreeSigns(
        sun_sign=sun_sign,
        sun_sign_alternative=sun_alternative,
        year_animal=year_pillar.animal,
        year_element=year_pillar.element,
        year_animal_alternative=animal_alternative,
        year_boundary=year_boundary,
    )


def is_near_solar_term(instant: datetime) -> bool:
    """True when ``instant`` is within :data:`SOLAR_TERM_WARNING_WINDOW` of a month-changing solar term.

    Every 节 (jie) changes the month pillar (and 立春 also the BaZi year), so comparing with the
    nearest one is equivalent to, and much cheaper than, recomputing the pillars at ±2 hours.
    """
    return abs(nearest_jie(instant).instant - instant) <= SOLAR_TERM_WARNING_WINDOW


def _resolve_birth_time(
    birth_date: date, birth_time: time, tz_name: str, fold: int | None
) -> tuple[ResolvedTime, bool]:
    """Resolve the wall time; also report whether ``fold`` had to decide between two instants."""
    if fold is not None and (isinstance(fold, bool) or fold not in (0, 1)):
        raise ValueError("fold must be None, 0 or 1")
    try:
        return resolve_local_time(birth_date, birth_time, tz_name), False
    except AmbiguousLocalTime as exc:
        if fold is None:
            raise
        return exc.options[fold], True


def _chart_input(resolved: ResolvedTime, place: Place) -> ChartInput:
    return ChartInput(
        local_datetime=resolved.local.isoformat(timespec="seconds"),
        utc_datetime=resolved.utc.isoformat(timespec="seconds"),
        timezone=place.timezone,
        utc_offset_minutes=resolved.utc_offset_minutes,
        is_dst=resolved.is_dst,
        fold=resolved.fold,
        latitude=place.latitude,
        longitude=place.longitude,
        place_label=place.label,
    )


def _validate_place(place: Place) -> None:
    if not isinstance(place, Place):
        raise TypeError("place must be a Place")
    if not _is_finite_number(place.latitude) or not -90 <= place.latitude <= 90:
        raise ValueError("latitude must be a number between -90 and 90")
    if not _is_finite_number(place.longitude) or not -180 <= place.longitude <= 180:
        raise ValueError("longitude must be a number between -180 and 180")
    if not isinstance(place.label, str):
        raise ValueError("label must be a string")


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_year_boundary(year_boundary: str) -> None:
    if year_boundary not in get_args(YearBoundary):
        raise ValueError(f"unknown year_boundary: {year_boundary!r}")


def _validate_day_boundary(day_boundary: str) -> None:
    if day_boundary not in get_args(DayBoundary):
        raise ValueError(f"unknown day_boundary: {day_boundary!r}")
