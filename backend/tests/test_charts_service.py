"""app.charts.service: chart composition, warnings, date range and the free-plan signs."""

from __future__ import annotations

import json
import math
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.astro.timezones import AmbiguousLocalTime, NonexistentLocalTime
from app.astro.western import compute_western
from app.charts import service
from app.charts.schemas import CALC_VERSION, Chart, FreeSigns
from app.charts.service import (
    MIN_BIRTH_DATE,
    WARNING_AMBIGUOUS_TIME_RESOLVED,
    WARNING_NEAR_SOLAR_TERM,
    WARNING_SUN_ON_CUSP,
    BirthDateOutOfRange,
    Place,
    build_chart,
    free_signs,
    is_near_solar_term,
    latest_birth_date,
    validate_birth_date,
)
from app.chinese.bazi import compute_chinese
from app.chinese.solar_terms import jie_terms

CAIRO = Place(30.06263, 31.24967, "Africa/Cairo", "Cairo, Egypt")
NEW_YORK = Place(40.71427, -74.00597, "America/New_York", "New York City, United States")
LONDON = Place(51.50853, -0.12574, "Europe/London", "London, United Kingdom")
SYDNEY = Place(-33.86785, 151.20732, "Australia/Sydney", "Sydney, Australia")
KATHMANDU = Place(27.70169, 85.3206, "Asia/Kathmandu", "Kathmandu, Nepal")
KIRITIMATI = Place(1.87, -157.43, "Pacific/Kiritimati", "Kiritimati, Kiribati")
LONGYEARBYEN = Place(78.22334, 15.64689, "Arctic/Longyearbyen", "Longyearbyen, Svalbard")

DEFAULTS = {"year_boundary": "lichun", "day_boundary": "midnight"}


@pytest.fixture(autouse=True)
def _clean_state():
    """Pure calculations: skip conftest's per-test table truncation."""
    yield


@pytest.fixture
def frozen_now(monkeypatch):
    """Freeze ``utcnow`` as seen by the chart service; returns a setter."""

    def _freeze(instant: datetime) -> None:
        monkeypatch.setattr(service, "utcnow", lambda: instant)

    return _freeze


def chart_for(d: date, t: time, place: Place, *, fold: int | None = None, **conventions: str) -> Chart:
    return build_chart(d, t, place, fold=fold, **{**DEFAULTS, **conventions})


def ganzhi(pillar) -> str:
    return pillar.stem + pillar.branch


# ---------------------------------------------------------------------------
# Real births
# ---------------------------------------------------------------------------


def test_cairo_1990_summer_time():
    chart = chart_for(date(1990, 8, 17), time(14, 30), CAIRO)

    # Egypt observed DST in 1990 (UTC+3), unlike in 2015.
    assert chart.input.local_datetime == "1990-08-17T14:30:00+03:00"
    assert chart.input.utc_datetime == "1990-08-17T11:30:00+00:00"
    assert chart.input.utc_offset_minutes == 180
    assert chart.input.is_dst is True
    assert chart.input.fold == 0
    assert chart.input.timezone == "Africa/Cairo"
    assert (chart.input.latitude, chart.input.longitude) == (CAIRO.latitude, CAIRO.longitude)
    assert chart.input.place_label == "Cairo, Egypt"

    assert chart.calc_version == CALC_VERSION
    assert chart.western.sun.sign == "leo"
    assert 24.0 < chart.western.sun.degree_in_sign < 24.6
    assert chart.western.moon.sign == "cancer"
    assert chart.western.ascendant.sign == "sagittarius"
    assert chart.western.sun_on_cusp is False

    # 1990 = 庚午 metal horse; after 立秋 (Aug 8) the month is 甲申 (五虎遁: 乙庚之岁戊为头).
    assert ganzhi(chart.chinese.year) == "庚午"
    assert chart.chinese.year.animal == "horse"
    assert chart.chinese.year.element == "metal"
    assert ganzhi(chart.chinese.month) == "甲申"
    assert chart.chinese.month.animal == "monkey"
    assert chart.chinese.hour.branch == "未"  # 13:00-14:59
    assert chart.chinese.year_boundary == "lichun"
    assert chart.chinese.day_boundary == "midnight"
    assert chart.warnings == []


def test_cairo_2015_has_no_summer_time():
    chart = chart_for(date(2015, 8, 17), time(14, 30), CAIRO)
    assert chart.input.utc_offset_minutes == 120
    assert chart.input.is_dst is False
    assert chart.input.utc_datetime == "2015-08-17T12:30:00+00:00"


def test_chart_is_the_composition_of_western_and_chinese():
    chart = chart_for(date(1990, 8, 17), time(14, 30), CAIRO)
    utc = datetime.fromisoformat(chart.input.utc_datetime)
    local = datetime(1990, 8, 17, 14, 30, tzinfo=ZoneInfo("Africa/Cairo"))

    assert chart.western == compute_western(utc, CAIRO.latitude, CAIRO.longitude)
    assert chart.chinese == compute_chinese(local, "lichun", "midnight")


@pytest.mark.parametrize(
    ("d", "t", "offset", "is_dst", "sun_sign"),
    [
        (date(1985, 1, 15), time(8, 0), 0, False, "capricorn"),
        (date(2000, 7, 1), time(12, 0), 60, True, "cancer"),
        # British Standard Time 1968-71: UTC+1 all year, but standard time, not DST.
        (date(1970, 1, 15), time(12, 0), 60, False, "capricorn"),
    ],
)
def test_london(d, t, offset, is_dst, sun_sign):
    chart = chart_for(d, t, LONDON)
    assert chart.input.utc_offset_minutes == offset
    assert chart.input.is_dst is is_dst
    assert chart.western.sun.sign == sun_sign
    utc = datetime.combine(d, t, tzinfo=UTC) - timedelta(minutes=offset)
    assert datetime.fromisoformat(chart.input.utc_datetime) == utc
    assert chart.western == compute_western(utc, LONDON.latitude, LONDON.longitude)


def test_local_and_utc_strings_describe_the_same_instant():
    chart = chart_for(date(2000, 7, 1), time(12, 0), LONDON)
    local = datetime.fromisoformat(chart.input.local_datetime)
    utc = datetime.fromisoformat(chart.input.utc_datetime)
    assert local == utc
    assert utc.utcoffset() == timedelta(0)
    assert local.utcoffset() == timedelta(minutes=chart.input.utc_offset_minutes)


def test_local_mean_time_offset_keeps_the_exact_instant():
    # Kathmandu used local mean time (+05:41:16) until 1920; the rounded minutes are informative only.
    chart = chart_for(date(1910, 5, 1), time(12, 0), KATHMANDU)
    assert chart.input.local_datetime == "1910-05-01T12:00:00+05:41:16"
    assert chart.input.utc_datetime == "1910-05-01T06:18:44+00:00"
    assert chart.input.utc_offset_minutes == 341
    assert datetime.fromisoformat(chart.input.local_datetime) == datetime.fromisoformat(chart.input.utc_datetime)


# ---------------------------------------------------------------------------
# Time resolution: ambiguous and nonexistent wall times
# ---------------------------------------------------------------------------


def test_ambiguous_time_propagates_without_fold():
    with pytest.raises(AmbiguousLocalTime) as exc_info:
        chart_for(date(2021, 11, 7), time(1, 30), NEW_YORK)
    options = exc_info.value.options
    assert [o.utc for o in options] == [
        datetime(2021, 11, 7, 5, 30, tzinfo=UTC),
        datetime(2021, 11, 7, 6, 30, tzinfo=UTC),
    ]
    assert [o.utc_offset_minutes for o in options] == [-240, -300]


@pytest.mark.parametrize(
    ("fold", "utc", "offset", "is_dst"),
    [
        (0, "2021-11-07T05:30:00+00:00", -240, True),
        (1, "2021-11-07T06:30:00+00:00", -300, False),
    ],
)
def test_ambiguous_time_resolved_with_fold(fold, utc, offset, is_dst):
    chart = chart_for(date(2021, 11, 7), time(1, 30), NEW_YORK, fold=fold)
    assert chart.input.utc_datetime == utc
    assert chart.input.utc_offset_minutes == offset
    assert chart.input.is_dst is is_dst
    assert chart.input.fold == fold
    assert chart.input.local_datetime.startswith("2021-11-07T01:30:00")
    assert WARNING_AMBIGUOUS_TIME_RESOLVED in chart.warnings
    # 立冬 2021 is at 04:58:47 UTC, so both readings are within 2 h of a month change.
    assert WARNING_NEAR_SOLAR_TERM in chart.warnings
    assert chart.chinese.month.branch == "亥"


def test_ambiguous_time_in_southern_hemisphere():
    # Sydney leaves DST on the first Sunday of April: 02:00-02:59 happens twice.
    with pytest.raises(AmbiguousLocalTime):
        chart_for(date(2021, 4, 4), time(2, 30), SYDNEY)
    later = chart_for(date(2021, 4, 4), time(2, 30), SYDNEY, fold=1)
    assert later.input.utc_offset_minutes == 600
    assert later.input.is_dst is False


def test_fold_is_ignored_for_unambiguous_times():
    chart = chart_for(date(1990, 8, 17), time(14, 30), CAIRO, fold=1)
    assert chart.input.fold == 0
    assert WARNING_AMBIGUOUS_TIME_RESOLVED not in chart.warnings
    assert chart == chart_for(date(1990, 8, 17), time(14, 30), CAIRO)


@pytest.mark.parametrize("fold", [None, 0, 1])
def test_nonexistent_time_always_propagates(fold):
    with pytest.raises(NonexistentLocalTime) as exc_info:
        chart_for(date(2021, 3, 14), time(2, 30), NEW_YORK, fold=fold)
    suggested = exc_info.value.suggested
    assert suggested.local.replace(tzinfo=None) == datetime(2021, 3, 14, 3, 30)


def test_cairo_2023_midnight_gap():
    # Egypt re-introduced DST in 2023, jumping from 00:00 to 01:00 on April 28.
    with pytest.raises(NonexistentLocalTime):
        chart_for(date(2023, 4, 28), time(0, 30), CAIRO)


# ---------------------------------------------------------------------------
# Chinese conventions and the Lichun boundary
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("t", "year", "month", "near_term"),
    [
        (time(3, 0), "癸卯", "乙丑", True),  # 27 min before Lichun (08:27:07 UTC = 03:27 EST)
        (time(4, 0), "甲辰", "丙寅", True),  # 33 min after: dragon year
        (time(5, 27), "甲辰", "丙寅", True),  # just under 2 h after
        (time(5, 28), "甲辰", "丙寅", False),  # just over 2 h after
        (time(12, 0), "甲辰", "丙寅", False),
    ],
)
def test_new_york_birth_around_lichun_2024(t, year, month, near_term):
    chart = chart_for(date(2024, 2, 4), t, NEW_YORK)
    assert ganzhi(chart.chinese.year) == year
    assert ganzhi(chart.chinese.month) == month
    assert (WARNING_NEAR_SOLAR_TERM in chart.warnings) is near_term
    # The day pillar follows the birthplace's calendar date, not China's.
    assert chart.chinese.day == chart_for(date(2024, 2, 4), time(12, 0), NEW_YORK).chinese.day


def test_lunar_new_year_boundary_is_recorded_and_used():
    # Lichun has passed but Chinese New Year 2024 is on Feb 10: still the rabbit year.
    chart = chart_for(date(2024, 2, 4), time(4, 0), NEW_YORK, year_boundary="lunar_new_year")
    assert chart.chinese.year_boundary == "lunar_new_year"
    assert chart.chinese.year.animal == "rabbit"
    assert ganzhi(chart.chinese.month) == "丙寅"  # month still changes at the solar term


def test_day_boundary_setting_changes_only_the_day_pillar_at_23h():
    midnight = chart_for(date(1990, 8, 17), time(23, 30), CAIRO, day_boundary="midnight")
    zi_23 = chart_for(date(1990, 8, 17), time(23, 30), CAIRO, day_boundary="zi_23")
    assert midnight.chinese.day_boundary == "midnight"
    assert zi_23.chinese.day_boundary == "zi_23"
    assert ganzhi(midnight.chinese.day) == "甲寅"
    assert ganzhi(zi_23.chinese.day) == "乙卯"
    assert midnight.chinese.hour == zi_23.chinese.hour
    assert midnight.chinese.year == zi_23.chinese.year
    assert midnight.chinese.month == zi_23.chinese.month
    assert midnight.western == zi_23.western


# ---------------------------------------------------------------------------
# Warnings
# ---------------------------------------------------------------------------


def test_sun_on_cusp_warning():
    # March equinox 2024 was 03:06 UTC; at noon the Sun is ~0.37° into Aries.
    chart = chart_for(date(2024, 3, 20), time(12, 0), LONDON)
    assert chart.western.sun.sign == "aries"
    assert chart.western.sun_on_cusp is True
    assert chart.warnings == [WARNING_SUN_ON_CUSP]


def test_all_warnings_together_are_stable_and_unique():
    chart = chart_for(date(2021, 11, 7), time(1, 30), NEW_YORK, fold=0)
    assert chart.warnings == [WARNING_AMBIGUOUS_TIME_RESOLVED, WARNING_NEAR_SOLAR_TERM]
    assert len(set(chart.warnings)) == len(chart.warnings)


def _month_pillar_at(instant: datetime) -> str:
    return ganzhi(compute_chinese(instant.astimezone(UTC), "lichun", "midnight").month)


@pytest.mark.parametrize("year", [1900, 1951, 1988, 2024, 2030])
def test_near_solar_term_matches_month_pillar_oracle(year):
    """Warning <=> the month pillar differs between 2 h before and 2 h after the birth instant."""
    for term in jie_terms(year):
        for minutes in (-300, -125, -119, -61, -1, 0, 1, 59, 119, 125, 300):
            instant = term.instant + timedelta(minutes=minutes)
            window = timedelta(hours=2)
            changes = _month_pillar_at(instant - window) != _month_pillar_at(instant + window)
            assert is_near_solar_term(instant) is changes, (term.key, minutes)


def test_near_solar_term_window_edges():
    lichun = jie_terms(2024)[1].instant
    assert is_near_solar_term(lichun + timedelta(hours=2)) is True
    assert is_near_solar_term(lichun - timedelta(hours=2)) is True
    assert is_near_solar_term(lichun + timedelta(hours=2, seconds=1)) is False
    assert is_near_solar_term(lichun - timedelta(hours=2, seconds=1)) is False


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("d", "t", "place", "fold"),
    [
        (date(1990, 8, 17), time(14, 30), CAIRO, None),
        (date(2021, 11, 7), time(1, 30), NEW_YORK, 1),
        (date(1910, 5, 1), time(12, 0), KATHMANDU, None),
        (date(2024, 3, 20), time(12, 0), LONDON, None),
    ],
)
def test_json_round_trip(d, t, place, fold):
    chart = chart_for(d, t, place, fold=fold)
    stored = json.loads(json.dumps(chart.model_dump(mode="json")))
    assert Chart.model_validate(stored) == chart
    assert stored["input"]["fold"] == chart.input.fold
    assert stored["calc_version"] == CALC_VERSION


# ---------------------------------------------------------------------------
# Supported date range
# ---------------------------------------------------------------------------


def test_earliest_supported_birth():
    chart = chart_for(MIN_BIRTH_DATE, time(0, 0), LONDON)
    assert chart.input.utc_datetime == "1900-01-01T00:00:00+00:00"
    assert ganzhi(chart.chinese.year) == "己亥"  # before Lichun 1900: still the 1899 pig year
    # West of Greenwich, 1900-01-01 00:00 local is already 1900-01-01 05:00 UTC.
    assert chart_for(MIN_BIRTH_DATE, time(0, 0), NEW_YORK).input.utc_offset_minutes == -300


@pytest.mark.parametrize("d", [date(1899, 12, 31), date(1800, 6, 1), date(1, 1, 1)])
def test_dates_before_1900_are_rejected(d):
    with pytest.raises(BirthDateOutOfRange) as exc_info:
        chart_for(d, time(12, 0), LONDON)
    assert exc_info.value.earliest == MIN_BIRTH_DATE
    with pytest.raises(BirthDateOutOfRange):
        free_signs(d, year_boundary="lichun")


def test_out_of_range_error_is_a_value_error_and_hides_the_birth_date():
    with pytest.raises(ValueError, match="between 1900-01-01 and") as exc_info:
        validate_birth_date(date(1899, 12, 31))
    assert "1899" not in str(exc_info.value)


def test_latest_birth_date_is_today_somewhere_on_earth(frozen_now):
    frozen_now(datetime(2026, 10, 5, 9, 0, tzinfo=UTC))  # 23:00 at UTC+14
    assert latest_birth_date() == date(2026, 10, 5)
    frozen_now(datetime(2026, 10, 5, 10, 0, tzinfo=UTC))  # 00:00 Oct 6 at UTC+14
    assert latest_birth_date() == date(2026, 10, 6)


def test_future_dates_are_rejected(frozen_now):
    frozen_now(datetime(2026, 10, 5, 9, 0, tzinfo=UTC))
    validate_birth_date(date(2026, 10, 5))
    free_signs(date(2026, 10, 5), year_boundary="lichun")
    for d in (date(2026, 10, 6), date(2100, 1, 1)):
        with pytest.raises(BirthDateOutOfRange) as exc_info:
            free_signs(d, year_boundary="lichun")
        assert exc_info.value.latest == date(2026, 10, 5)


def test_birth_instant_in_the_future_is_rejected(frozen_now):
    frozen_now(datetime(2026, 10, 5, 12, 0, tzinfo=UTC))
    assert chart_for(date(2026, 10, 5), time(12, 0), LONDON).input.utc_datetime == "2026-10-05T11:00:00+00:00"
    assert chart_for(date(2026, 10, 5), time(13, 0), LONDON).input.utc_datetime == "2026-10-05T12:00:00+00:00"
    with pytest.raises(BirthDateOutOfRange):
        chart_for(date(2026, 10, 5), time(13, 1), LONDON)


def test_birth_today_at_utc_plus_14(frozen_now):
    # 10:30 UTC on Oct 5 is already 00:30 on Oct 6 in Kiritimati.
    frozen_now(datetime(2026, 10, 5, 11, 0, tzinfo=UTC))
    chart = chart_for(date(2026, 10, 6), time(0, 30), KIRITIMATI)
    assert chart.input.utc_offset_minutes == 14 * 60
    assert chart.input.utc_datetime == "2026-10-05T10:30:00+00:00"


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tz", ["Mars/Olympus_Mons", "../../etc/passwd", "africa/cairo", "", "localtime", "UTC+3"])
def test_unknown_time_zone_is_rejected(tz):
    with pytest.raises(ValueError):
        chart_for(date(1990, 8, 17), time(14, 30), Place(30.0, 31.0, tz, "x"))


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(90.01, 0.0), (-91.0, 0.0), (0.0, 180.5), (0.0, -181.0), (math.nan, 0.0), (0.0, math.inf), (True, 0.0)],
)
def test_invalid_coordinates_are_rejected(latitude, longitude):
    with pytest.raises(ValueError):
        chart_for(date(1990, 8, 17), time(14, 30), Place(latitude, longitude, "Africa/Cairo", "x"))


@pytest.mark.parametrize("fold", [2, -1, True])
def test_invalid_fold_is_rejected_even_for_unambiguous_times(fold):
    with pytest.raises(ValueError, match="fold"):
        chart_for(date(1990, 8, 17), time(14, 30), CAIRO, fold=fold)


@pytest.mark.parametrize(
    "conventions", [{"year_boundary": "gregorian"}, {"day_boundary": "noon"}, {"year_boundary": ""}]
)
def test_unknown_conventions_are_rejected(conventions):
    with pytest.raises(ValueError, match="boundary"):
        chart_for(date(1990, 8, 17), time(14, 30), CAIRO, **conventions)


def test_unknown_year_boundary_rejected_by_free_signs():
    with pytest.raises(ValueError, match="year_boundary"):
        free_signs(date(1990, 8, 17), year_boundary="solstice")


def test_aware_birth_time_is_rejected():
    with pytest.raises(ValueError):
        chart_for(date(1990, 8, 17), time(14, 30, tzinfo=UTC), CAIRO)


def test_datetime_is_not_accepted_as_birth_date():
    with pytest.raises(TypeError):
        chart_for(datetime(1990, 8, 17, 14, 30), time(14, 30), CAIRO)
    with pytest.raises(TypeError):
        free_signs(datetime(1990, 8, 17), year_boundary="lichun")


def test_place_must_be_a_place():
    with pytest.raises(TypeError):
        build_chart(date(1990, 8, 17), time(14, 30), {"latitude": 30.0}, fold=None, **DEFAULTS)


def test_place_is_immutable():
    with pytest.raises(AttributeError):
        CAIRO.timezone = "Europe/London"


def test_extreme_places():
    polar = chart_for(date(2000, 6, 21), time(12, 0), LONGYEARBYEN)
    assert 0 <= polar.western.ascendant.longitude < 360
    date_line = chart_for(date(2000, 6, 21), time(12, 0), Place(-13.83, -171.77, "Pacific/Apia", "Apia, Samoa"))
    assert date_line.input.longitude == -171.77
    east_edge = chart_for(date(2000, 6, 21), time(12, 0), Place(0.0, 180.0, "Pacific/Fiji", "Fiji"))
    assert east_edge.input.longitude == 180.0


# ---------------------------------------------------------------------------
# free_signs
# ---------------------------------------------------------------------------


def test_free_signs_ordinary_date():
    assert free_signs(date(1990, 8, 17), year_boundary="lichun") == FreeSigns(
        sun_sign="leo",
        sun_sign_alternative=None,
        year_animal="horse",
        year_element="metal",
        year_animal_alternative=None,
        year_boundary="lichun",
    )


@pytest.mark.parametrize(
    ("d", "sign", "alternative"),
    [
        (date(2024, 3, 20), "aries", "pisces"),  # equinox 03:06 UTC
        (date(2024, 3, 19), "pisces", "aries"),  # Mar 19 at UTC-12 lasts until Mar 20 12:00 UTC
        (date(2024, 3, 21), "aries", None),
        (date(2024, 3, 18), "pisces", None),
    ],
)
def test_free_signs_cusp_dates(d, sign, alternative):
    signs = free_signs(d, year_boundary="lichun")
    assert (signs.sun_sign, signs.sun_sign_alternative) == (sign, alternative)


@pytest.mark.parametrize(
    ("d", "boundary", "animal", "element", "alternative"),
    [
        (date(2024, 2, 3), "lichun", "rabbit", "water", "dragon"),
        (date(2024, 2, 4), "lichun", "rabbit", "water", "dragon"),
        (date(2024, 2, 5), "lichun", "dragon", "wood", None),
        (date(2024, 2, 8), "lunar_new_year", "rabbit", "water", None),
        (date(2024, 2, 9), "lunar_new_year", "rabbit", "water", "dragon"),
        (date(2024, 2, 10), "lunar_new_year", "dragon", "wood", "rabbit"),
        (date(2024, 2, 11), "lunar_new_year", "dragon", "wood", None),
        (date(2024, 2, 9), "lichun", "dragon", "wood", None),
    ],
)
def test_free_signs_chinese_year_boundaries(d, boundary, animal, element, alternative):
    signs = free_signs(d, year_boundary=boundary)
    assert signs.year_boundary == boundary
    assert (signs.year_animal, signs.year_element, signs.year_animal_alternative) == (animal, element, alternative)


def test_free_signs_agree_with_full_chart_away_from_boundaries():
    for d in (date(1955, 6, 1), date(1977, 11, 30), date(1990, 8, 17), date(2012, 12, 25)):
        signs = free_signs(d, year_boundary="lichun")
        chart = chart_for(d, time(12, 0), CAIRO)
        assert signs.sun_sign == chart.western.sun.sign
        assert signs.year_animal == chart.chinese.year.animal
        assert signs.year_element == chart.chinese.year.element
