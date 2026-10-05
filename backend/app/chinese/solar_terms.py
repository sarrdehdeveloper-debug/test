"""Solar-term instants and Chinese New Year dates from lunar-python, as timezone-aware values.

lunar-python computes solar terms (节气) and new moons in China Standard Time: its
``ShouXingUtil.qiAccurate`` converts the ephemeris result from TT to UT and adds 1/3 day (+8 h).
That is a *fixed* UTC+8, not the IANA zone ``Asia/Shanghai`` (which had summer time in 1986-1991 and
local mean time before 1901 — never used by the almanac), so everything here uses
:data:`CHINA_STANDARD_TIME`. tests/test_chinese_bazi.py checks the instants against an independent
ephemeris (PyEphem): they agree within ~20 s for 1900-2030.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Final

from lunar_python import Lunar, LunarYear, Solar

CHINA_STANDARD_TIME: Final = timezone(timedelta(hours=8), "UTC+08:00")

# Calculations are validated (against an ephemeris) well inside this range; the product itself
# accepts births from 1900 on. Outside it, values would be extrapolated, so refuse them.
MIN_YEAR: Final = 1800
MAX_YEAR: Final = 2200

# The 12 节 (jie) that start the BaZi months, in calendar order, with lowercase tone-less keys.
JIE: Final[tuple[tuple[str, str], ...]] = (
    ("小寒", "xiaohan"),
    ("立春", "lichun"),
    ("惊蛰", "jingzhe"),
    ("清明", "qingming"),
    ("立夏", "lixia"),
    ("芒种", "mangzhong"),
    ("小暑", "xiaoshu"),
    ("立秋", "liqiu"),
    ("白露", "bailu"),
    ("寒露", "hanlu"),
    ("立冬", "lidong"),
    ("大雪", "daxue"),
)

# lunar-python Julian days are "local" (UTC+8) day counts; J2000.0 = 2000-01-01 12:00 on that scale.
_J2000_CHINA: Final = datetime(2000, 1, 1, 12, tzinfo=CHINA_STANDARD_TIME)
_SECONDS_PER_DAY: Final = 86_400


@dataclass(frozen=True)
class SolarTerm:
    key: str  # e.g. "lichun"
    name_zh: str  # e.g. "立春"
    instant: datetime  # aware, UTC


def require_aware(value: datetime, name: str = "datetime") -> None:
    if not isinstance(value, datetime):
        raise TypeError(f"{name} must be a datetime, got {type(value).__name__}")
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")


def require_supported_year(year: int) -> None:
    if not MIN_YEAR <= year <= MAX_YEAR:
        raise ValueError(f"year {year} is outside the supported range {MIN_YEAR}-{MAX_YEAR}")


def to_china_time(instant: datetime) -> datetime:
    """The same instant as wall time in China Standard Time (fixed UTC+8)."""
    require_aware(instant)
    return instant.astimezone(CHINA_STANDARD_TIME)


def lunar_at(wall: datetime) -> Lunar:
    """lunar-python's view of a wall-clock time; only the fields are used, the tzinfo is ignored."""
    return Solar.fromYmdHms(wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second).getLunar()


@lru_cache(maxsize=512)
def jie_terms(year: int) -> tuple[SolarTerm, ...]:
    """The 12 month-starting solar terms of Gregorian ``year`` (China calendar), chronological."""
    require_supported_year(year)
    # LunarYear(y) tabulates the terms from 大雪 of y-1 to 惊蛰 of y+1; the Chinese-named entries
    # 小寒 … 大雪 are the ones inside Gregorian year y.
    julian_days = dict(zip(Lunar.JIE_QI_IN_USE, LunarYear.fromYear(year).getJieQiJulianDays(), strict=True))
    return tuple(SolarTerm(key=key, name_zh=name, instant=_from_julian_day(julian_days[name])) for name, key in JIE)


def lichun_instant(year: int) -> datetime:
    """Instant (UTC) of 立春 — Sun at apparent longitude 315° — in Gregorian ``year``."""
    return jie_terms(year)[1].instant


@lru_cache(maxsize=512)
def chinese_new_year(year: int) -> date:
    """Date of 正月初一 (Chinese New Year) of lunar year ``year``, as a China (UTC+8) calendar date."""
    require_supported_year(year)
    solar = Lunar.fromYmd(year, 1, 1).getSolar()
    return date(solar.getYear(), solar.getMonth(), solar.getDay())


def nearest_jie(instant: datetime) -> SolarTerm:
    """The month-changing solar term closest in time to ``instant`` (before or after it).

    Useful for flagging births close to a month/year pillar change (time-of-birth uncertainty).
    """
    year = to_china_time(instant).year
    require_supported_year(year)
    candidates = list(jie_terms(year))
    if year > MIN_YEAR:
        candidates.append(jie_terms(year - 1)[-1])
    if year < MAX_YEAR:
        candidates.append(jie_terms(year + 1)[0])
    return min(candidates, key=lambda term: abs(term.instant - instant))


def _from_julian_day(julian_day: float) -> datetime:
    # Rounded to the second like lunar-python's own Solar.fromJulianDay, so comparisons agree with
    # the pillars lunar-python derives from the same table.
    seconds = round((julian_day - Solar.J2000) * _SECONDS_PER_DAY)
    return (_J2000_CHINA + timedelta(seconds=seconds)).astimezone(UTC)
