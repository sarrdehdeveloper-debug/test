"""Birth wall time -> UTC instant, with historical IANA rules, DST gaps and folds."""

from __future__ import annotations

import dataclasses
from datetime import UTC, date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.astro.timezones import (
    AmbiguousLocalTime,
    NonexistentLocalTime,
    ResolvedTime,
    get_zone,
    is_valid_timezone,
    resolve_local_time,
)


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def assert_consistent(r: ResolvedTime, tz_name: str) -> None:
    """Invariants every ResolvedTime must satisfy."""
    assert r.local.tzinfo == ZoneInfo(tz_name)
    assert r.utc.tzinfo is UTC
    # Same instant. (PEP 495: ``==`` across zones is always False for a repeated wall time.)
    assert r.local.astimezone(UTC) == r.utc
    assert r.utc.astimezone(ZoneInfo(tz_name)).replace(tzinfo=None) == r.local.replace(tzinfo=None)
    assert r.local.fold == r.fold
    assert r.utc_offset_minutes == round(r.local.utcoffset().total_seconds() / 60)


# ---------------------------------------------------------------------------------------------
# Historical rules (never fixed offsets)
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("d", "t", "tz_name", "expected_utc", "offset", "is_dst"),
    [
        # Egypt: DST in summer 1990, none in 2015, re-introduced in 2023.
        (date(1990, 8, 17), time(14, 30), "Africa/Cairo", utc(1990, 8, 17, 11, 30), 180, True),
        (date(1990, 1, 17), time(14, 30), "Africa/Cairo", utc(1990, 1, 17, 12, 30), 120, False),
        (date(2015, 7, 1), time(12, 0), "Africa/Cairo", utc(2015, 7, 1, 10, 0), 120, False),
        (date(2023, 7, 1), time(12, 0), "Africa/Cairo", utc(2023, 7, 1, 9, 0), 180, True),
        (date(2023, 12, 1), time(12, 0), "Africa/Cairo", utc(2023, 12, 1, 10, 0), 120, False),
        # British Standard Time: UTC+1 all year from Oct 1968 to Oct 1971, and it was *standard* time.
        (date(1970, 1, 15), time(12, 0), "Europe/London", utc(1970, 1, 15, 11, 0), 60, False),
        (date(1969, 12, 25), time(9, 0), "Europe/London", utc(1969, 12, 25, 8, 0), 60, False),
        (date(1972, 1, 15), time(12, 0), "Europe/London", utc(1972, 1, 15, 12, 0), 0, False),
        (date(1972, 7, 15), time(12, 0), "Europe/London", utc(1972, 7, 15, 11, 0), 60, True),
        # Half- and quarter-hour zones; Nepal moved from +05:30 to +05:45 in 1986.
        (date(1990, 5, 17), time(14, 30), "Asia/Kolkata", utc(1990, 5, 17, 9, 0), 330, False),
        (date(2020, 1, 1), time(12, 0), "Asia/Kathmandu", utc(2020, 1, 1, 6, 15), 345, False),
        (date(1985, 6, 1), time(12, 0), "Asia/Kathmandu", utc(1985, 6, 1, 6, 30), 330, False),
        # Lord Howe Island: +10:30 standard, 30-minute DST to +11:00.
        (date(2020, 1, 1), time(12, 0), "Australia/Lord_Howe", utc(2020, 1, 1, 1, 0), 660, True),
        (date(2020, 7, 1), time(12, 0), "Australia/Lord_Howe", utc(2020, 7, 1, 1, 30), 630, False),
        # Line Islands: UTC+14, the earliest time zone on Earth.
        (date(2020, 1, 1), time(1, 0), "Pacific/Kiritimati", utc(2019, 12, 31, 11, 0), 840, False),
        # Southern hemisphere DST and negative offsets.
        (date(2020, 1, 15), time(12, 0), "America/Sao_Paulo", utc(2020, 1, 15, 15, 0), -180, False),
        (date(2018, 1, 15), time(12, 0), "America/Sao_Paulo", utc(2018, 1, 15, 14, 0), -120, True),
        (date(2021, 7, 4), time(12, 0), "America/New_York", utc(2021, 7, 4, 16, 0), -240, True),
        (date(2000, 2, 29), time(23, 59), "UTC", utc(2000, 2, 29, 23, 59), 0, False),
    ],
)
def test_historical_offsets(d, t, tz_name, expected_utc, offset, is_dst):
    r = resolve_local_time(d, t, tz_name)
    assert r.utc == expected_utc
    assert r.utc_offset_minutes == offset
    assert r.is_dst is is_dst
    assert r.fold == 0
    assert r.local.replace(tzinfo=None) == datetime.combine(d, t)
    assert_consistent(r, tz_name)


def test_local_mean_time_offset_keeps_exact_instant():
    # Kathmandu used local mean time (+05:41:16) until 1920: the minute offset is rounded for
    # display but the UTC instant stays exact to the second.
    r = resolve_local_time(date(1910, 1, 1), time(12, 0), "Asia/Kathmandu")
    assert r.utc == utc(1910, 1, 1, 6, 18, 44)
    assert r.utc_offset_minutes == 341
    assert_consistent(r, "Asia/Kathmandu")


def test_seconds_and_microseconds_are_preserved():
    r = resolve_local_time(date(1990, 8, 17), time(14, 30, 15, 500), "Africa/Cairo")
    assert r.utc == datetime(1990, 8, 17, 11, 30, 15, 500, tzinfo=UTC)


def test_resolved_time_is_immutable():
    r = resolve_local_time(date(2000, 1, 1), time(0, 0), "UTC")
    with pytest.raises(dataclasses.FrozenInstanceError):
        r.fold = 1  # type: ignore[misc]


# ---------------------------------------------------------------------------------------------
# Ambiguous wall times (clocks go back)
# ---------------------------------------------------------------------------------------------


def test_new_york_fall_back_is_ambiguous():
    with pytest.raises(AmbiguousLocalTime) as excinfo:
        resolve_local_time(date(2021, 11, 7), time(1, 30), "America/New_York")
    first, second = excinfo.value.options
    assert (first.fold, first.utc, first.utc_offset_minutes, first.is_dst) == (0, utc(2021, 11, 7, 5, 30), -240, True)
    assert (second.fold, second.utc, second.utc_offset_minutes, second.is_dst) == (
        1,
        utc(2021, 11, 7, 6, 30),
        -300,
        False,
    )
    for option in (first, second):
        assert option.local.replace(tzinfo=None) == datetime(2021, 11, 7, 1, 30)
        assert_consistent(option, "America/New_York")


@pytest.mark.parametrize("fold", [0, 1])
def test_explicit_fold_selects_option(fold):
    with pytest.raises(AmbiguousLocalTime) as excinfo:
        resolve_local_time(date(2021, 11, 7), time(1, 30), "America/New_York")
    chosen = resolve_local_time(date(2021, 11, 7), time(1, 30), "America/New_York", fold=fold)
    assert chosen == excinfo.value.options[fold]
    assert chosen.fold == fold


def test_cairo_2023_fall_back_at_midnight_is_ambiguous():
    # Egypt ends DST on the last Thursday of October at 24:00 -> 23:00.
    with pytest.raises(AmbiguousLocalTime) as excinfo:
        resolve_local_time(date(2023, 10, 26), time(23, 30), "Africa/Cairo")
    assert [o.utc_offset_minutes for o in excinfo.value.options] == [180, 120]
    assert [o.utc for o in excinfo.value.options] == [utc(2023, 10, 26, 20, 30), utc(2023, 10, 26, 21, 30)]


def test_lord_howe_half_hour_fold():
    with pytest.raises(AmbiguousLocalTime) as excinfo:
        resolve_local_time(date(2021, 4, 4), time(1, 45), "Australia/Lord_Howe")
    first, second = excinfo.value.options
    assert (first.utc_offset_minutes, second.utc_offset_minutes) == (660, 630)
    assert second.utc - first.utc == timedelta(minutes=30)


def test_fold_is_ignored_for_unambiguous_times():
    plain = resolve_local_time(date(2021, 7, 4), time(12, 0), "America/New_York")
    assert resolve_local_time(date(2021, 7, 4), time(12, 0), "America/New_York", fold=1) == plain
    assert plain.fold == 0


def test_incoming_time_fold_attribute_does_not_leak():
    # A caller-supplied time(fold=1) must not silently pick the later instant.
    with pytest.raises(AmbiguousLocalTime):
        resolve_local_time(date(2021, 11, 7), time(1, 30, fold=1), "America/New_York")
    r = resolve_local_time(date(2021, 11, 7), time(1, 30, fold=1), "America/New_York", fold=0)
    assert r.utc == utc(2021, 11, 7, 5, 30)


# ---------------------------------------------------------------------------------------------
# Nonexistent wall times (clocks jump forward)
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("fold", [None, 0, 1])
def test_new_york_spring_forward_is_nonexistent(fold):
    with pytest.raises(NonexistentLocalTime) as excinfo:
        resolve_local_time(date(2021, 3, 14), time(2, 30), "America/New_York", fold=fold)
    suggested = excinfo.value.suggested
    assert suggested.local.replace(tzinfo=None) == datetime(2021, 3, 14, 3, 30)
    assert suggested.utc == utc(2021, 3, 14, 7, 30)
    assert suggested.utc_offset_minutes == -240
    assert suggested.is_dst is True
    assert_consistent(suggested, "America/New_York")


@pytest.mark.parametrize(
    ("d", "t", "tz_name", "suggested_local"),
    [
        # Egypt 2023: clocks jumped from 00:00 to 01:00 on the last Friday of April.
        (date(2023, 4, 28), time(0, 30), "Africa/Cairo", datetime(2023, 4, 28, 1, 30)),
        # Lord Howe: 30-minute gap 02:00 -> 02:30.
        (date(2021, 10, 3), time(2, 15), "Australia/Lord_Howe", datetime(2021, 10, 3, 2, 45)),
        # Kiribati skipped 31 Dec 1994 entirely when it moved from UTC-10 to UTC+14.
        (date(1994, 12, 31), time(12, 0), "Pacific/Kiritimati", datetime(1995, 1, 1, 12, 0)),
        # Samoa skipped 30 Dec 2011 when crossing the date line.
        (date(2011, 12, 30), time(12, 0), "Pacific/Apia", datetime(2011, 12, 31, 12, 0)),
        (date(2021, 3, 28), time(1, 30), "Europe/London", datetime(2021, 3, 28, 2, 30)),
    ],
)
def test_gaps_suggest_time_shifted_by_gap(d, t, tz_name, suggested_local):
    with pytest.raises(NonexistentLocalTime) as excinfo:
        resolve_local_time(d, t, tz_name)
    suggested = excinfo.value.suggested
    assert suggested.local.replace(tzinfo=None) == suggested_local
    assert_consistent(suggested, tz_name)
    # The suggestion is a real wall time that resolves to the same instant.
    again = resolve_local_time(suggested.local.date(), suggested.local.time(), tz_name)
    assert again.utc == suggested.utc


def test_edges_of_gap_exist():
    before = resolve_local_time(date(2021, 3, 14), time(1, 59), "America/New_York")
    after = resolve_local_time(date(2021, 3, 14), time(3, 0), "America/New_York")
    assert after.utc - before.utc == timedelta(minutes=1)


@pytest.mark.parametrize(
    ("tz_name", "year", "step_minutes", "expected_gap", "expected_fold"),
    [
        ("America/New_York", 2021, 15, 4, 4),
        ("Europe/London", 2021, 15, 4, 4),
        ("Australia/Lord_Howe", 2021, 15, 2, 2),
        ("Asia/Kolkata", 2021, 15, 0, 0),
    ],
)
def test_whole_year_scan_is_consistent(tz_name, year, step_minutes, expected_gap, expected_fold):
    """Every wall time of a year either resolves (and round-trips), is skipped or is repeated."""
    zone = ZoneInfo(tz_name)
    gaps = folds = 0
    wall = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)
    while wall < end:
        try:
            r = resolve_local_time(wall.date(), wall.time(), tz_name)
        except NonexistentLocalTime as exc:
            gaps += 1
            assert exc.suggested.local.replace(tzinfo=None) > wall
        except AmbiguousLocalTime as exc:
            folds += 1
            first, second = exc.options
            assert first.utc < second.utc
            assert (first.fold, second.fold) == (0, 1)
        else:
            assert r.utc.astimezone(zone).replace(tzinfo=None) == wall
        wall += timedelta(minutes=step_minutes)
    assert (gaps, folds) == (expected_gap, expected_fold)


# ---------------------------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "tz_name",
    [
        "Mars/Olympus_Mons",
        "",
        "utc",  # IANA keys are case-sensitive
        "America",  # a directory, not a zone
        "America/",
        "../../etc/passwd",
        "/etc/localtime",
        "localtime",  # host-specific, not a location
        "posixrules",
        "Africa/Cairo\x00",
        "+03:00",
    ],
)
def test_unknown_time_zone_raises_value_error(tz_name):
    assert is_valid_timezone(tz_name) is False
    with pytest.raises(ValueError, match="unknown time zone"):
        resolve_local_time(date(2000, 1, 1), time(12, 0), tz_name)


def test_non_string_time_zone_raises_value_error():
    with pytest.raises(ValueError):
        resolve_local_time(date(2000, 1, 1), time(12, 0), None)  # type: ignore[arg-type]


@pytest.mark.parametrize("tz_name", ["Africa/Cairo", "Asia/Calcutta", "US/Eastern", "Etc/GMT-14", "UTC"])
def test_known_time_zones_including_aliases(tz_name):
    assert is_valid_timezone(tz_name)
    assert get_zone(tz_name) == ZoneInfo(tz_name)


@pytest.mark.parametrize("fold", [-1, 2, 0.0, "1"])
def test_invalid_fold(fold):
    with pytest.raises(ValueError, match="fold"):
        resolve_local_time(date(2021, 11, 7), time(1, 30), "America/New_York", fold=fold)


def test_aware_time_is_rejected():
    with pytest.raises(ValueError, match="naive"):
        resolve_local_time(date(2021, 7, 4), time(12, 0, tzinfo=timezone(timedelta(hours=3))), "Africa/Cairo")
