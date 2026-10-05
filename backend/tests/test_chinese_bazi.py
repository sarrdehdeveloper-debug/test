"""Tests for app.chinese (BaZi pillars, solar terms, year animal for a bare date).

Reference values and their sources are noted next to each test. PyEphem (test-only dependency) is
used as an independent ephemeris oracle for solar-term instants and year/month pillars.
"""

from __future__ import annotations

import math
import random
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import ephem
import pytest
from lunar_python import Lunar, Solar

from app.charts.schemas import ChineseChart
from app.chinese.bazi import compute_chinese, year_pillar_for_date
from app.chinese.solar_terms import (
    CHINA_STANDARD_TIME,
    JIE,
    chinese_new_year,
    jie_terms,
    lichun_instant,
    nearest_jie,
    to_china_time,
)
from app.chinese.symbols import (
    BRANCHES,
    STEMS,
    make_pillar,
    pillar_at,
    pillar_from_ganzhi,
    sexagenary_index,
    shift_pillar,
)

SHANGHAI = ZoneInfo("Asia/Shanghai")
NEW_YORK = ZoneInfo("America/New_York")
BOTH_DAY_BOUNDARIES = ("midnight", "zi_23")
BOTH_YEAR_BOUNDARIES = ("lichun", "lunar_new_year")

# 五鼠遁: stem of the 子 hour for each day stem (甲己还加甲, 乙庚丙作初, 丙辛从戊起, 丁壬庚子居, 戊癸何方发 壬子是真途).
WU_SHU_DUN = {
    "甲": "甲",
    "己": "甲",
    "乙": "丙",
    "庚": "丙",
    "丙": "戊",
    "辛": "戊",
    "丁": "庚",
    "壬": "庚",
    "戊": "壬",
    "癸": "壬",
}
STEM_CHARS = "甲乙丙丁戊己庚辛壬癸"
BRANCH_CHARS = "子丑寅卯辰巳午未申酉戌亥"


@pytest.fixture(autouse=True)
def _clean_state() -> Iterator[None]:
    """Overrides conftest's autouse fixture: these are pure calculations, no database to truncate."""
    yield


def pillars(chart: ChineseChart) -> str:
    return " ".join(f"{p.stem}{p.branch}" for p in (chart.year, chart.month, chart.day, chart.hour))


def ganzhi(pillar) -> str:
    return f"{pillar.stem}{pillar.branch}"


# --- independent oracles -------------------------------------------------------------------------


def sun_apparent_longitude(instant: datetime) -> float:
    """Geocentric apparent ecliptic longitude of the Sun (equinox of date), degrees, via PyEphem."""
    when = ephem.Date(instant.astimezone(UTC).replace(tzinfo=None))
    sun = ephem.Sun()
    sun.compute(when)
    ecliptic = ephem.Ecliptic(ephem.Equatorial(sun.g_ra, sun.g_dec, epoch=when), epoch=when)
    return math.degrees(ecliptic.lon)


def sun_crossing(longitude: float, guess: datetime) -> datetime:
    """Instant (UTC) near ``guess`` (±1 day) when the Sun's apparent longitude equals ``longitude``."""

    def offset(t: datetime) -> float:
        return (sun_apparent_longitude(t) - longitude + 180) % 360 - 180

    low, high = guess - timedelta(days=1), guess + timedelta(days=1)
    assert offset(low) < 0 < offset(high)
    while high - low > timedelta(milliseconds=100):
        middle = low + (high - low) / 2
        if offset(middle) < 0:
            low = middle
        else:
            high = middle
    return low


def day_index_from_julian_day_number(d: date) -> int:
    """Sexagenary day index (甲子 = 0): (JDN + 49) mod 60, JDN = proleptic ordinal + 1721425."""
    return (d.toordinal() + 1721425 + 49) % 60


JIE_LONGITUDE = {
    "xiaohan": 285,
    "lichun": 315,
    "jingzhe": 345,
    "qingming": 15,
    "lixia": 45,
    "mangzhong": 75,
    "xiaoshu": 105,
    "liqiu": 135,
    "bailu": 165,
    "hanlu": 195,
    "lidong": 225,
    "daxue": 255,
}


# --- stems, branches, pillars ----------------------------------------------------------------------


def test_stem_attributes():
    table = [(s.char, s.pinyin, s.element, s.polarity) for s in STEMS]
    assert table == [
        ("甲", "jia", "wood", "yang"),
        ("乙", "yi", "wood", "yin"),
        ("丙", "bing", "fire", "yang"),
        ("丁", "ding", "fire", "yin"),
        ("戊", "wu", "earth", "yang"),
        ("己", "ji", "earth", "yin"),
        ("庚", "geng", "metal", "yang"),
        ("辛", "xin", "metal", "yin"),
        ("壬", "ren", "water", "yang"),
        ("癸", "gui", "water", "yin"),
    ]


def test_branch_attributes():
    table = [(b.char, b.pinyin, b.animal) for b in BRANCHES]
    assert table == [
        ("子", "zi", "rat"),
        ("丑", "chou", "ox"),
        ("寅", "yin", "tiger"),
        ("卯", "mao", "rabbit"),
        ("辰", "chen", "dragon"),
        ("巳", "si", "snake"),
        ("午", "wu", "horse"),
        ("未", "wei", "goat"),
        ("申", "shen", "monkey"),
        ("酉", "you", "rooster"),
        ("戌", "xu", "dog"),
        ("亥", "hai", "pig"),
    ]


def test_make_pillar_fills_all_fields():
    p = make_pillar("庚", "午")
    assert p.model_dump() == {
        "stem": "庚",
        "branch": "午",
        "stem_pinyin": "geng",
        "branch_pinyin": "wu",
        "animal": "horse",
        "element": "metal",
        "polarity": "yang",
    }
    assert make_pillar("辛", "未").animal == "goat"


@pytest.mark.parametrize("stem,branch", [("甲", "丑"), ("乙", "子"), ("癸", "子")])
def test_make_pillar_rejects_pairs_outside_the_cycle(stem, branch):
    with pytest.raises(ValueError, match="sexagenary"):
        make_pillar(stem, branch)


@pytest.mark.parametrize("text", ["", "甲", "甲子丑", "AB", "子甲", "甲X"])
def test_pillar_from_ganzhi_rejects_garbage(text):
    with pytest.raises(ValueError):
        pillar_from_ganzhi(text)


def test_sexagenary_cycle_roundtrip_and_shift():
    seen = set()
    for n in range(60):
        p = pillar_at(n)
        assert sexagenary_index(p) == n
        assert STEM_CHARS.index(p.stem) == n % 10 and BRANCH_CHARS.index(p.branch) == n % 12
        seen.add(ganzhi(p))
    assert len(seen) == 60
    assert ganzhi(pillar_at(0)) == "甲子" and ganzhi(pillar_at(59)) == "癸亥"
    assert ganzhi(shift_pillar(pillar_at(59), 1)) == "甲子"
    assert ganzhi(shift_pillar(pillar_at(0), -1)) == "癸亥"
    assert ganzhi(pillar_at(-1)) == "癸亥"


# --- reference charts ------------------------------------------------------------------------------


def test_lunar_python_readme_example():
    # lunar-python README (github.com/6tail/lunar-python, "示例"): Lunar.fromYmd(1986, 4, 21) prints
    # "一九八六年四月廿一 丙寅(虎)年 癸巳(蛇)月 癸酉(鸡)日 子(鼠)时 …" and its solar date "1986-05-29 00:00:00".
    assert Lunar.fromYmd(1986, 4, 21).getSolar().toYmd() == "1986-05-29"
    # 子 hour of a 癸 day is 壬子 (五鼠遁: 戊癸何方发，壬子是真途).
    for zone in (CHINA_STANDARD_TIME, SHANGHAI):  # Shanghai was on summer time (UTC+9) that day
        chart = compute_chinese(datetime(1986, 5, 29, 0, 0, tzinfo=zone), "lichun", "midnight")
        assert pillars(chart) == "丙寅 癸巳 癸酉 壬子"
        assert (chart.year.animal, chart.month.animal, chart.day.animal, chart.hour.animal) == (
            "tiger",
            "snake",
            "rooster",
            "rat",
        )


@pytest.mark.parametrize("year_boundary", BOTH_YEAR_BOUNDARIES)
@pytest.mark.parametrize("day_boundary", BOTH_DAY_BOUNDARIES)
def test_6tail_eight_char_example(year_boundary, day_boundary):
    # lunar documentation (6tail.cn/calendar/api.html, 八字): Solar 2005-12-23 08:37:00 -> 乙酉 戊子 辛巳 壬辰.
    chart = compute_chinese(datetime(2005, 12, 23, 8, 37, tzinfo=SHANGHAI), year_boundary, day_boundary)
    assert pillars(chart) == "乙酉 戊子 辛巳 壬辰"
    assert (chart.year_boundary, chart.day_boundary) == (year_boundary, day_boundary)
    # Day master 辛 = yin metal.
    assert (chart.day.element, chart.day.polarity) == ("metal", "yin")


@pytest.mark.parametrize(
    "day,expected",
    [
        # Hong Kong Observatory Gregorian-Lunar conversion table for 2000: 2000-01-01 is a 戊午 day.
        (date(2000, 1, 1), "戊午"),
        # 1949-10-01 (founding of the PRC) was a 甲子 day — the classic anchor of the day cycle.
        (date(1949, 10, 1), "甲子"),
        # lunar-python README example above: 1986-05-29 is 癸酉.
        (date(1986, 5, 29), "癸酉"),
    ],
)
def test_known_day_pillars(day, expected):
    chart = compute_chinese(datetime.combine(day, time(12), tzinfo=SHANGHAI), "lichun", "midnight")
    assert ganzhi(chart.day) == expected
    assert ganzhi(pillar_at(day_index_from_julian_day_number(day))) == expected


@pytest.mark.parametrize("year_boundary", BOTH_YEAR_BOUNDARIES)
def test_1990_08_17_is_a_metal_horse_year(year_boundary):
    # 1990 = 庚午 (metal horse) from Lichun 1990-02-04 / Chinese New Year 1990-01-27 (HKO tables).
    chart = compute_chinese(datetime(1990, 8, 17, 14, 30, tzinfo=ZoneInfo("Africa/Cairo")), year_boundary, "midnight")
    assert ganzhi(chart.year) == "庚午"
    assert (chart.year.animal, chart.year.element, chart.year.polarity) == ("horse", "metal", "yang")
    pillar, alternative = year_pillar_for_date(date(1990, 8, 17), year_boundary)
    assert (ganzhi(pillar), pillar.animal, alternative) == ("庚午", "horse", None)


# --- solar terms are China Standard Time --------------------------------------------------------------


def test_lunar_python_solar_terms_are_utc_plus_8():
    # Lichun 2024: 2024-02-04 16:27 Hong Kong/Beijing time (HKO "24 Solar Terms" 2024; PMO 16:26:53).
    raw = Solar.fromYmd(2024, 6, 1).getLunar().getJieQiTable()["立春"].toYmdHms()
    assert raw.startswith("2024-02-04 16:2")
    oracle = sun_crossing(315, datetime(2024, 2, 4, 8, tzinfo=UTC))
    assert abs(oracle - datetime(2024, 2, 4, 8, 27, tzinfo=UTC)) < timedelta(minutes=1)

    as_china_time = datetime.fromisoformat(raw).replace(tzinfo=CHINA_STANDARD_TIME)
    as_utc = datetime.fromisoformat(raw).replace(tzinfo=UTC)
    assert abs(as_china_time - oracle) < timedelta(minutes=1)
    assert abs(as_utc - oracle) > timedelta(hours=7)  # read as UTC it would be 8 h off
    assert lichun_instant(2024) == as_china_time


def test_jie_terms_match_ephemeris_1900_2030():
    years = [*range(1900, 2031, 5), 2024]
    worst = timedelta(0)
    for year in years:
        terms = jie_terms(year)
        assert [t.key for t in terms] == [key for _, key in JIE]
        assert [t.name_zh for t in terms] == [name for name, _ in JIE]
        instants = [t.instant for t in terms]
        assert instants == sorted(instants)
        for term in terms:
            assert term.instant.tzinfo is not None
            assert to_china_time(term.instant).year == year
            oracle = sun_crossing(JIE_LONGITUDE[term.key], term.instant)
            worst = max(worst, abs(term.instant - oracle))
    # Measured: ~20 s worst case over 1900-2030 (ΔT model differences); 60 s leaves headroom.
    assert worst < timedelta(seconds=60)


def test_chinese_new_year_dates():
    # Hong Kong Observatory calendar tables (Lunar New Year's Day).
    assert chinese_new_year(1990) == date(1990, 1, 27)
    assert chinese_new_year(2023) == date(2023, 1, 22)
    assert chinese_new_year(2024) == date(2024, 2, 10)
    assert chinese_new_year(2025) == date(2025, 1, 29)
    assert chinese_new_year(1900) == date(1900, 1, 31)


def test_nearest_jie():
    lichun = lichun_instant(2024)
    assert nearest_jie(lichun + timedelta(hours=3)).key == "lichun"
    assert nearest_jie(lichun - timedelta(days=10)).key == "lichun"
    end_of_year = nearest_jie(datetime(2024, 12, 31, 12, tzinfo=UTC))
    assert (end_of_year.key, to_china_time(end_of_year.instant).date()) == ("xiaohan", date(2025, 1, 5))
    start_of_year = nearest_jie(datetime(2024, 1, 1, tzinfo=NEW_YORK))
    assert (start_of_year.key, to_china_time(start_of_year.instant).date()) == ("xiaohan", date(2024, 1, 6))
    with pytest.raises(ValueError, match="aware"):
        nearest_jie(datetime(2024, 1, 1))


# --- year pillar at Lichun ----------------------------------------------------------------------------


def test_lichun_2024_in_shanghai():
    # lunar-python: Lichun 2024 at 16:27:07 Beijing time.
    before = compute_chinese(datetime(2024, 2, 4, 16, 26, tzinfo=SHANGHAI), "lichun", "midnight")
    after = compute_chinese(datetime(2024, 2, 4, 16, 28, tzinfo=SHANGHAI), "lichun", "midnight")
    assert (ganzhi(before.year), before.year.animal, ganzhi(before.month)) == ("癸卯", "rabbit", "乙丑")
    assert (ganzhi(after.year), after.year.animal, ganzhi(after.month)) == ("甲辰", "dragon", "丙寅")
    assert ganzhi(before.day) == ganzhi(after.day)


def test_lichun_2024_in_new_york_uses_the_instant():
    # Lichun 2024 = 2024-02-04 08:27:07 UTC = 03:27:07 EST.
    before = compute_chinese(datetime(2024, 2, 4, 3, 26, tzinfo=NEW_YORK), "lichun", "midnight")
    after = compute_chinese(datetime(2024, 2, 4, 3, 28, tzinfo=NEW_YORK), "lichun", "midnight")
    assert (before.year.animal, ganzhi(before.month)) == ("rabbit", "乙丑")
    assert (after.year.animal, ganzhi(after.month)) == ("dragon", "丙寅")
    # 10:00 in New York is 23:00 in Beijing: after Lichun, although "10:00" < "16:27" as wall times.
    morning = compute_chinese(datetime(2024, 2, 4, 10, 0, tzinfo=NEW_YORK), "lichun", "midnight")
    assert morning.year.animal == "dragon"


def test_day_pillar_uses_the_birthplace_date_not_china_date():
    # 22:00 on Feb 3 in New York is already 11:00 on Feb 4 in Beijing; the day pillar is Feb 3's.
    ny = compute_chinese(datetime(2024, 2, 3, 22, 0, tzinfo=NEW_YORK), "lichun", "midnight")
    feb3 = compute_chinese(datetime(2024, 2, 3, 12, 0, tzinfo=SHANGHAI), "lichun", "midnight")
    feb4 = compute_chinese(datetime(2024, 2, 4, 12, 0, tzinfo=SHANGHAI), "lichun", "midnight")
    assert ganzhi(ny.day) == ganzhi(feb3.day) != ganzhi(feb4.day)
    assert ny.hour.branch == "亥"  # 21:00-22:59 local
    assert ny.year.animal == "rabbit"  # 11:00 Beijing is before Lichun (16:27)


# --- month pillar at the jie -------------------------------------------------------------------------


def test_month_pillar_around_jingzhe_2024():
    # 惊蛰 2024: 2024-03-05 10:23 Beijing (HKO); lunar-python 10:22:45 = 2024-03-04 21:22:45 EST.
    assert ganzhi(compute_chinese(datetime(2024, 3, 5, 10, 22, tzinfo=SHANGHAI), "lichun", "midnight").month) == "丙寅"
    assert ganzhi(compute_chinese(datetime(2024, 3, 5, 10, 23, tzinfo=SHANGHAI), "lichun", "midnight").month) == "丁卯"
    ny_before = compute_chinese(datetime(2024, 3, 4, 21, 22, tzinfo=NEW_YORK), "lichun", "midnight")
    ny_after = compute_chinese(datetime(2024, 3, 4, 21, 23, tzinfo=NEW_YORK), "lichun", "midnight")
    assert (ganzhi(ny_before.month), ny_before.month.animal) == ("丙寅", "tiger")
    assert (ganzhi(ny_after.month), ny_after.month.animal) == ("丁卯", "rabbit")


def test_month_pillar_around_xiaohan_keeps_the_chinese_year():
    # 小寒 2024: 2024-01-06 04:49:22 Beijing. The Gregorian year changed, the BaZi year (癸卯) did not.
    before = compute_chinese(datetime(2024, 1, 6, 4, 49, tzinfo=SHANGHAI), "lichun", "midnight")
    after = compute_chinese(datetime(2024, 1, 6, 4, 50, tzinfo=SHANGHAI), "lichun", "midnight")
    assert (ganzhi(before.year), ganzhi(before.month)) == ("癸卯", "甲子")
    assert (ganzhi(after.year), ganzhi(after.month)) == ("癸卯", "乙丑")


def test_solar_terms_use_fixed_utc8_not_shanghai_summer_time():
    # China observed summer time in 1988 (UTC+9). 芒种 1988 = 1988-06-05 19:14:53 China Standard Time,
    # i.e. 20:14:53 on Shanghai clocks. A birth at 20:00 Shanghai clock time is 19:00 CST: still 巳 month.
    assert datetime(1988, 6, 5, 20, 0, tzinfo=SHANGHAI).utcoffset() == timedelta(hours=9)
    before = compute_chinese(datetime(1988, 6, 5, 20, 0, tzinfo=SHANGHAI), "lichun", "midnight")
    after = compute_chinese(datetime(1988, 6, 5, 20, 30, tzinfo=SHANGHAI), "lichun", "midnight")
    assert (ganzhi(before.year), ganzhi(before.month)) == ("戊辰", "丁巳")
    assert ganzhi(after.month) == "戊午"
    # Hour pillar is from the clock time (20:00 -> 戌), not from standard time.
    assert before.hour.branch == "戌"


# --- lunar New Year mode -----------------------------------------------------------------------------


def test_lunar_new_year_mode_around_cny_2024_in_china():
    # Chinese New Year 2024 (Year of the Dragon, 甲辰) fell on 2024-02-10 (HKO).
    eve = compute_chinese(datetime(2024, 2, 9, 23, 59, tzinfo=SHANGHAI), "lunar_new_year", "midnight")
    day = compute_chinese(datetime(2024, 2, 10, 0, 0, tzinfo=SHANGHAI), "lunar_new_year", "midnight")
    assert (ganzhi(eve.year), eve.year.animal) == ("癸卯", "rabbit")
    assert (ganzhi(day.year), day.year.animal) == ("甲辰", "dragon")
    # Between Lichun (Feb 4) and CNY the two conventions disagree; the month pillar is shared.
    lichun_mode = compute_chinese(datetime(2024, 2, 9, 23, 59, tzinfo=SHANGHAI), "lichun", "midnight")
    assert lichun_mode.year.animal == "dragon"
    assert ganzhi(eve.month) == ganzhi(lichun_mode.month) == "丙寅"
    assert ganzhi(eve.day) == ganzhi(lichun_mode.day)


def test_lunar_new_year_mode_follows_the_china_date():
    # 10:59 EST on Feb 9 = 23:59 Feb 9 Beijing (old year); 11:00 EST = 00:00 Feb 10 Beijing (new year).
    old = compute_chinese(datetime(2024, 2, 9, 10, 59, tzinfo=NEW_YORK), "lunar_new_year", "midnight")
    new = compute_chinese(datetime(2024, 2, 9, 11, 0, tzinfo=NEW_YORK), "lunar_new_year", "midnight")
    assert (old.year.animal, new.year.animal) == ("rabbit", "dragon")


def test_lunar_new_year_mode_before_cny_in_january():
    # 2024-01-20 is before both Lichun and CNY: 癸卯 in both modes.
    for year_boundary in BOTH_YEAR_BOUNDARIES:
        chart = compute_chinese(datetime(2024, 1, 20, 9, 0, tzinfo=SHANGHAI), year_boundary, "midnight")
        assert ganzhi(chart.year) == "癸卯"
    # 2023-01-25 is after CNY 2023 (Jan 22) but before Lichun 2023 (Feb 4).
    assert compute_chinese(datetime(2023, 1, 25, 9, 0, tzinfo=SHANGHAI), "lunar_new_year", "midnight").year.animal == (
        "rabbit"
    )
    assert compute_chinese(datetime(2023, 1, 25, 9, 0, tzinfo=SHANGHAI), "lichun", "midnight").year.animal == "tiger"


# --- day boundary (zi_23) and hour pillar ---------------------------------------------------------------


def test_zi_23_versus_midnight_at_2330():
    # 2024-03-10 is a 癸酉 day, 2024-03-11 a 甲戌 day (lunar-python; consistent with the JDN cycle).
    assert ganzhi(pillar_at(day_index_from_julian_day_number(date(2024, 3, 10)))) == "癸酉"
    birth = datetime(2024, 3, 10, 23, 30, tzinfo=SHANGHAI)
    midnight = compute_chinese(birth, "lichun", "midnight")
    zi_23 = compute_chinese(birth, "lichun", "zi_23")
    # midnight (夜子时, lunar-python sect=2): day stays 癸酉; hour is the next day's 子 hour, 甲子.
    assert (ganzhi(midnight.day), ganzhi(midnight.hour)) == ("癸酉", "甲子")
    # zi_23 (sect=1): the day has already become 甲戌; the 子 hour of a 甲 day is 甲子.
    assert (ganzhi(zi_23.day), ganzhi(zi_23.hour)) == ("甲戌", "甲子")
    # Year and month pillars do not depend on the day boundary.
    assert (midnight.year, midnight.month) == (zi_23.year, zi_23.month)


@pytest.mark.parametrize(
    "clock,expected_day,expected_hour",
    [
        (time(22, 59), "癸酉", "癸亥"),  # last 亥 hour of the 癸 day
        (time(23, 0), None, "甲子"),
        (time(23, 59, 59), None, "甲子"),
    ],
)
def test_day_boundary_edges(clock, expected_day, expected_hour):
    birth = datetime.combine(date(2024, 3, 10), clock, tzinfo=SHANGHAI)
    for day_boundary in BOTH_DAY_BOUNDARIES:
        chart = compute_chinese(birth, "lichun", day_boundary)
        assert ganzhi(chart.hour) == expected_hour
        if expected_day is not None:
            assert ganzhi(chart.day) == expected_day
        else:
            assert ganzhi(chart.day) == ("癸酉" if day_boundary == "midnight" else "甲戌")


def test_early_zi_hour_is_the_same_in_both_conventions():
    birth = datetime(2024, 3, 11, 0, 30, tzinfo=SHANGHAI)
    charts = [compute_chinese(birth, "lichun", b) for b in BOTH_DAY_BOUNDARIES]
    assert charts[0] == charts[1].model_copy(update={"day_boundary": "midnight"})
    assert (ganzhi(charts[0].day), ganzhi(charts[0].hour)) == ("甲戌", "甲子")


def test_zi_23_on_new_years_eve_does_not_move_year_or_month():
    birth = datetime(2023, 12, 31, 23, 30, tzinfo=SHANGHAI)
    chart = compute_chinese(birth, "lichun", "zi_23")
    next_day = compute_chinese(datetime(2024, 1, 1, 12, 0, tzinfo=SHANGHAI), "lichun", "midnight")
    assert ganzhi(chart.day) == ganzhi(next_day.day)
    assert (ganzhi(chart.year), ganzhi(chart.month)) == ("癸卯", "甲子")


def test_ambiguous_local_time_folds_share_the_wall_clock_pillars():
    # 01:30 on 2024-11-03 happens twice in New York (EDT, then EST). Day/hour come from the clock.
    first = compute_chinese(datetime(2024, 11, 3, 1, 30, fold=0, tzinfo=NEW_YORK), "lichun", "midnight")
    second = compute_chinese(datetime(2024, 11, 3, 1, 30, fold=1, tzinfo=NEW_YORK), "lichun", "midnight")
    assert first == second
    assert first.hour.branch == "丑"


# --- properties ---------------------------------------------------------------------------------------


def test_day_pillars_follow_the_60_day_cycle_for_1000_days():
    start = date(1999, 6, 1)
    previous = None
    for offset in range(1000):
        day = start + timedelta(days=offset)
        chart = compute_chinese(datetime.combine(day, time(12), tzinfo=SHANGHAI), "lichun", "midnight")
        index = sexagenary_index(chart.day)
        assert index == day_index_from_julian_day_number(day), day
        if previous is not None:
            assert index == (previous + 1) % 60, day
        previous = index


@pytest.mark.parametrize("day_boundary", BOTH_DAY_BOUNDARIES)
def test_hour_pillars_follow_wu_shu_dun_for_every_day_stem(day_boundary):
    start = date(2024, 3, 1)
    day_stems_seen = set()
    for offset in range(10):
        day = start + timedelta(days=offset)
        today_stem = pillar_at(day_index_from_julian_day_number(day)).stem
        tomorrow_stem = pillar_at(day_index_from_julian_day_number(day) + 1).stem
        day_stems_seen.add(today_stem)
        for hour in range(24):
            chart = compute_chinese(datetime.combine(day, time(hour, 30), tzinfo=SHANGHAI), "lichun", day_boundary)
            branch = (hour + 1) // 2 % 12
            # 23:xx is the 子 hour of the next day: its stem comes from the next day's stem.
            ruling_stem = tomorrow_stem if hour == 23 else today_stem
            expected_stem = (STEM_CHARS.index(WU_SHU_DUN[ruling_stem]) + branch) % 10
            assert chart.hour.branch == BRANCH_CHARS[branch], (day, hour)
            assert chart.hour.stem == STEM_CHARS[expected_stem], (day, hour)
            expected_day_stem = tomorrow_stem if hour == 23 and day_boundary == "zi_23" else today_stem
            assert chart.day.stem == expected_day_stem, (day, hour)
    assert day_stems_seen == set(STEM_CHARS)


def test_year_and_month_pillars_match_ephemeris_oracle():
    rng = random.Random(20241005)
    span = (datetime(2030, 12, 31, tzinfo=UTC) - datetime(1900, 1, 2, tzinfo=UTC)).total_seconds()
    checked = 0
    while checked < 300:
        instant = datetime(1900, 1, 2, tzinfo=UTC) + timedelta(seconds=rng.uniform(0, span))
        longitude = sun_apparent_longitude(instant)
        # Skip instants within ~10 minutes of a jie (Sun moves ~0.04°/h); both sides are exercised
        # explicitly in the boundary tests above.
        distance_to_jie = abs(longitude % 30 - 15)  # jie lie at 15° mod 30° (285°, 315°, 345°, …)
        if distance_to_jie < 0.007:
            continue
        zone = timezone(timedelta(minutes=rng.randrange(-12 * 60, 14 * 60 + 1, 15)))
        local = instant.astimezone(zone).replace(microsecond=0)
        chart = compute_chinese(local, "lichun", rng.choice(BOTH_DAY_BOUNDARIES))

        china = to_china_time(instant)
        before_lichun = china.month <= 2 and 270 <= longitude < 315
        bazi_year = china.year - 1 if before_lichun else china.year
        year_stem, year_branch = (bazi_year - 4) % 10, (bazi_year - 4) % 12
        months_since_tiger = int(((longitude - 315) % 360) // 30)
        # 五虎遁: the 寅 month of a 甲/己 year is 丙寅, 乙/庚 -> 戊寅, 丙/辛 -> 庚寅, 丁/壬 -> 壬寅, 戊/癸 -> 甲寅.
        month_stem = ((year_stem % 5) * 2 + 2 + months_since_tiger) % 10
        month_branch = (months_since_tiger + 2) % 12

        assert ganzhi(chart.year) == STEM_CHARS[year_stem] + BRANCH_CHARS[year_branch], local
        assert ganzhi(chart.month) == STEM_CHARS[month_stem] + BRANCH_CHARS[month_branch], local
        assert sexagenary_index(chart.day) == day_index_from_julian_day_number(local.date()) or (
            chart.day_boundary == "zi_23" and local.hour == 23
        )
        checked += 1


def test_month_changes_exactly_at_each_jie_in_any_time_zone():
    # Births 3 minutes either side of every jie (sampled years), expressed in New York and Kolkata time.
    zones = (NEW_YORK, ZoneInfo("Asia/Kolkata"))
    for year in range(1901, 2031, 13):
        for term in jie_terms(year):
            for zone in zones:
                before = compute_chinese((term.instant - timedelta(minutes=3)).astimezone(zone), "lichun", "midnight")
                after = compute_chinese((term.instant + timedelta(minutes=3)).astimezone(zone), "lichun", "midnight")
                # Month pillars run on continuously through the 60-cycle (…丁丑 -> 戊寅…), even across years.
                assert sexagenary_index(after.month) == (sexagenary_index(before.month) + 1) % 60, (year, term.key)
                year_changed = sexagenary_index(after.year) != sexagenary_index(before.year)
                assert year_changed == (term.key == "lichun"), (year, term.key)


@pytest.mark.parametrize("year_boundary", BOTH_YEAR_BOUNDARIES)
def test_year_pillar_for_date_agrees_with_births_anywhere_on_that_date(year_boundary):
    earliest, latest = timezone(timedelta(hours=14)), timezone(timedelta(hours=-12))
    alternatives = 0
    # Includes the earliest (1966-01-21) and latest (1985-02-20) New Year dates of the period.
    for year in (1900, 1966, 1985, 2023, 2024):
        # Jan 19 - Feb 21 covers every possible Lichun (Feb 3-5) and Chinese New Year (Jan 21 - Feb 20).
        for offset in range(34):
            day = date(year, 1, 19) + timedelta(days=offset)
            pillar, alternative = year_pillar_for_date(day, year_boundary)
            at_noon_china = compute_chinese(
                datetime.combine(day, time(12), tzinfo=CHINA_STANDARD_TIME), year_boundary, "midnight"
            )
            assert pillar == at_noon_china.year, day
            first = compute_chinese(datetime.combine(day, time(0), tzinfo=earliest), year_boundary, "midnight")
            last = compute_chinese(datetime.combine(day, time(23, 59, 59), tzinfo=latest), year_boundary, "midnight")
            possible = {first.year.animal, last.year.animal}
            if alternative is None:
                assert possible == {pillar.animal}, day
            else:
                alternatives += 1
                assert possible == {pillar.animal, alternative}, day
    # Exactly two ambiguous dates per year boundary.
    assert alternatives == 2 * 5


def test_year_pillar_for_date_around_lichun_2024():
    # Lichun 2024-02-04 08:27 UTC. A date d is ambiguous when that instant lies between
    # d 00:00 at UTC+14 and d 24:00 at UTC-12.
    results = {d: year_pillar_for_date(date(2024, 2, d), "lichun") for d in (2, 3, 4, 5)}
    assert {d: (p.animal, alt) for d, (p, alt) in results.items()} == {
        2: ("rabbit", None),
        3: ("rabbit", "dragon"),  # 23:00 on Feb 3 in UTC-12 is 11:00 UTC on Feb 4: after Lichun
        4: ("rabbit", "dragon"),  # 12:00 Beijing on Feb 4 is still before Lichun (16:27)
        5: ("dragon", None),
    }
    assert ganzhi(results[5][0]) == "甲辰"
    assert (results[5][0].element, results[5][0].polarity) == ("wood", "yang")


def test_year_pillar_for_date_around_cny_2024():
    results = {d: year_pillar_for_date(date(2024, 2, d), "lunar_new_year") for d in (5, 8, 9, 10, 11)}
    assert {d: (p.animal, alt) for d, (p, alt) in results.items()} == {
        5: ("rabbit", None),  # after Lichun but before CNY: still the rabbit in the popular zodiac
        8: ("rabbit", None),
        9: ("rabbit", "dragon"),
        10: ("dragon", "rabbit"),
        11: ("dragon", None),
    }


# --- validation ----------------------------------------------------------------------------------------


def test_compute_chinese_rejects_naive_datetimes():
    with pytest.raises(ValueError, match="aware"):
        compute_chinese(datetime(2024, 2, 4, 12, 0), "lichun", "midnight")


@pytest.mark.parametrize("value", [date(2024, 2, 4), "2024-02-04T12:00:00+08:00", None])
def test_compute_chinese_rejects_non_datetimes(value):
    with pytest.raises(TypeError, match="must be a datetime"):
        compute_chinese(value, "lichun", "midnight")


def test_concurrent_calls_match_sequential_results():
    # Request handlers run in a thread pool and lunar-python keeps a shared (locked) LunarYear cache;
    # births across many years make threads keep replacing it.
    births = [
        datetime(year, month, 4, 16, 27, tzinfo=SHANGHAI) for year in range(1950, 2026, 5) for month in (1, 2, 3, 12)
    ]
    expected = [compute_chinese(b, "lichun", "zi_23") for b in births]
    with ThreadPoolExecutor(max_workers=8) as pool:
        actual = list(pool.map(lambda b: compute_chinese(b, "lichun", "zi_23"), births))
    assert actual == expected


@pytest.mark.parametrize(
    "year_boundary,day_boundary", [("solar", "midnight"), ("lichun", "noon"), ("", ""), ("LICHUN", "midnight")]
)
def test_compute_chinese_rejects_unknown_boundaries(year_boundary, day_boundary):
    with pytest.raises(ValueError, match="boundary"):
        compute_chinese(datetime(2024, 2, 4, 12, 0, tzinfo=UTC), year_boundary, day_boundary)


@pytest.mark.parametrize("year", [1, 1799, 2201, 9999])
def test_unsupported_years_are_rejected(year):
    with pytest.raises(ValueError, match="supported range"):
        compute_chinese(datetime(year, 6, 1, 12, tzinfo=UTC), "lichun", "midnight")
    with pytest.raises(ValueError, match="supported range"):
        year_pillar_for_date(date(year, 6, 1), "lichun")


def test_year_pillar_for_date_rejects_datetimes_and_unknown_boundaries():
    with pytest.raises(TypeError):
        year_pillar_for_date(datetime(2024, 2, 4, tzinfo=UTC), "lichun")
    with pytest.raises(ValueError, match="boundary"):
        year_pillar_for_date(date(2024, 2, 4), "chinese")


def test_supported_range_edges_work():
    # Product range starts 1900-01-01: before Lichun 1900, so the year is 己亥 (1899, pig).
    for zone in (timezone(timedelta(hours=14)), timezone(timedelta(hours=-12))):
        chart = compute_chinese(datetime(1900, 1, 1, 0, 0, tzinfo=zone), "lichun", "midnight")
        assert (ganzhi(chart.year), chart.year.animal) == ("己亥", "pig")
    assert year_pillar_for_date(date(1900, 1, 1), "lunar_new_year")[0].animal == "pig"
    today = date.today()
    compute_chinese(datetime.combine(today, time(23, 59), tzinfo=UTC), "lichun", "zi_23")


def test_chart_is_json_serialisable():
    chart = compute_chinese(datetime(1990, 8, 17, 14, 30, tzinfo=SHANGHAI), "lunar_new_year", "zi_23")
    data = chart.model_dump(mode="json")
    assert data["year_boundary"] == "lunar_new_year" and data["day_boundary"] == "zi_23"
    assert ChineseChart.model_validate(data) == chart
    for key in ("year", "month", "day", "hour"):
        assert data[key]["stem_pinyin"].isascii() and data[key]["stem_pinyin"].islower()
        assert data[key]["branch_pinyin"].isascii() and data[key]["branch_pinyin"].islower()
