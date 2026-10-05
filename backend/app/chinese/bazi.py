"""BaZi (Four Pillars) and Chinese zodiac animals, computed with lunar-python (MIT).

Contract: docs/ARCHITECTURE.md §4.3. Conventions, each covered by tests/test_chinese_bazi.py:

* **Year & month pillars** change at solar-term *instants*: the year at 立春 (Lichun, Sun at 315°),
  the month at each of the 12 节 (jie). lunar-python evaluates solar terms in China Standard Time
  (fixed UTC+8, see :mod:`app.chinese.solar_terms`), so the birth instant is converted to UTC+8 wall
  time before asking it. A New York birth at 21:30 on 2024-03-04 is 10:30 on 03-05 in Beijing, after
  惊蛰 (10:22 Beijing time), so it is already in the 卯 month.
* ``year_boundary="lunar_new_year"`` (popular zodiac): the year pillar is that of the lunar year
  containing the China (UTC+8) calendar date, i.e. it changes at 00:00 Beijing time on 正月初一.
  The month pillar is unchanged: still by solar terms, its stem following the Lichun year (五虎遁).
* **Day & hour pillars** use the local civil (wall-clock) time of the birthplace, with no
  true-solar-time correction. Hour branches are two-hour blocks (子 23:00-00:59, 丑 01:00-02:59, …)
  and the hour stem follows the day stem by 五鼠遁 (甲己→甲子, 乙庚→丙子, 丙辛→戊子, 丁壬→庚子, 戊癸→壬子).
* **23:00-23:59** is the 子 hour of the *next* day in both settings, so its hour stem always comes
  from the next day's stem. The settings differ only in the day pillar:

  - ``day_boundary="zi_23"``: the day pillar is already the next day's (lunar-python ``sect=1``).
  - ``day_boundary="midnight"``: the day pillar stays the current day's while the hour pillar is the
    next day's 子 hour — the classical 夜子时 / 晚子时 rule and lunar-python's default ``sect=2``.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Final, get_args

from lunar_python import Lunar

from app.charts.schemas import ChineseAnimal, ChineseChart, DayBoundary, Pillar, YearBoundary
from app.chinese.solar_terms import (
    CHINA_STANDARD_TIME,
    chinese_new_year,
    lichun_instant,
    lunar_at,
    require_aware,
    require_supported_year,
    to_china_time,
)
from app.chinese.symbols import pillar_at, pillar_from_ganzhi, shift_pillar

# The extreme civil offsets in use (Line Islands, Kiribati / Baker Island): one calendar date spans
# from its 00:00 at UTC+14 to its 24:00 at UTC-12, i.e. 50 hours of real time.
_EARLIEST_ZONE: Final = timezone(timedelta(hours=14))
_LATEST_ZONE: Final = timezone(timedelta(hours=-12))

# lunar-python EightChar "sect": 1 = day changes at 23:00, 2 = day changes at midnight.
_SECT: Final[dict[str, int]] = {"zi_23": 1, "midnight": 2}


def compute_chinese(local: datetime, year_boundary: YearBoundary, day_boundary: DayBoundary) -> ChineseChart:
    """Four pillars for a birth given as an aware datetime in the birthplace's time zone.

    ``local`` must carry the birthplace's zone (e.g. ``ZoneInfo("America/New_York")``, fold applied):
    its instant drives the year and month pillars, its wall-clock fields the day and hour pillars.
    """
    require_aware(local, "local")
    _require_year_boundary(year_boundary)
    _require_day_boundary(day_boundary)
    require_supported_year(local.year)

    china = lunar_at(to_china_time(local))
    eight_char = lunar_at(local).getEightChar()
    eight_char.setSect(_SECT[day_boundary])
    return ChineseChart(
        year_boundary=year_boundary,
        day_boundary=day_boundary,
        year=_year_pillar(china, year_boundary),
        month=pillar_from_ganzhi(china.getMonthInGanZhiExact()),
        day=pillar_from_ganzhi(eight_char.getDay()),
        hour=pillar_from_ganzhi(eight_char.getTime()),
    )


def year_pillar_for_date(d: date, year_boundary: YearBoundary) -> tuple[Pillar, ChineseAnimal | None]:
    """Year pillar for a birth date without time or place, plus the other possible animal, if any.

    The pillar is the one in force at 12:00 China Standard Time on ``d``. A calendar date covers
    different instants around the world (from its 00:00 at UTC+14 to its 24:00 at UTC-12), so when
    the year changes within that span a birth on ``d`` may belong to either year; the animal of the
    *other* year is then returned as the alternative (``None`` otherwise):

    * ``"lichun"``: the Lichun instant lies strictly inside [d 00:00 UTC+14, d+1 00:00 UTC-12),
      i.e. between d-1 10:00 UTC and d+1 12:00 UTC. Typically two consecutive dates around Feb 4.
    * ``"lunar_new_year"``: the year changes at 00:00 Beijing time on New Year's day N. Clocks in
      UTC-12 … UTC+14 show dates N-1 … N at that moment, so ``d`` is ambiguous when it is N or the
      day before it.
    """
    if isinstance(d, datetime):
        raise TypeError("year_pillar_for_date expects a date, not a datetime")
    _require_year_boundary(year_boundary)
    require_supported_year(d.year)

    # The only year change near any date is the one into Gregorian year d.year (both boundaries fall
    # in Jan/Feb), so it suffices to know on which side of it ``d`` lies and whether it is ambiguous.
    if year_boundary == "lichun":
        boundary = lichun_instant(d.year)
        after_change = datetime.combine(d, time(12), tzinfo=CHINA_STANDARD_TIME) >= boundary
        span_start = datetime.combine(d, time(0), tzinfo=_EARLIEST_ZONE)
        span_end = datetime.combine(d + timedelta(days=1), time(0), tzinfo=_LATEST_ZONE)
        ambiguous = span_start < boundary < span_end
    else:
        new_year_day = chinese_new_year(d.year)
        after_change = d >= new_year_day
        ambiguous = d in (new_year_day - timedelta(days=1), new_year_day)

    pillar = _pillar_of_year(d.year if after_change else d.year - 1)
    if not ambiguous:
        return pillar, None
    return pillar, shift_pillar(pillar, -1 if after_change else 1).animal


def _year_pillar(china: Lunar, year_boundary: YearBoundary) -> Pillar:
    if year_boundary == "lichun":
        return pillar_from_ganzhi(china.getYearInGanZhiExact())
    return pillar_from_ganzhi(china.getYearInGanZhi())


def _pillar_of_year(year: int) -> Pillar:
    """Pillar of the Chinese year that starts in Gregorian ``year`` (4 CE was a 甲子 year)."""
    return pillar_at(year - 4)


def _require_year_boundary(value: str) -> None:
    if value not in get_args(YearBoundary):
        raise ValueError(f"unknown year_boundary: {value!r}")


def _require_day_boundary(value: str) -> None:
    if value not in get_args(DayBoundary):
        raise ValueError(f"unknown day_boundary: {value!r}")
