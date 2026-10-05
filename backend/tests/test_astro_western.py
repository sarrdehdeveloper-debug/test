"""Western chart points vs. Meeus' worked examples and an independent ephemeris (PyEphem).

PyEphem is a test-only oracle. Note: ``ephem.Ecliptic(body)`` uses the *astrometric* position
(no aberration, no nutation, ~25" off); the apparent ecliptic longitude of date is obtained from the
apparent geocentric RA/Dec: ``Ecliptic(Equatorial(body.ra, body.dec, epoch=date), epoch=date)``.
"""

from __future__ import annotations

import math
import random
import time as timer
from datetime import UTC, date, datetime, timedelta, timezone

import ephem
import pytest

from app.astro import western
from app.astro.western import (
    apparent_sidereal_time,
    ascendant_longitude,
    compute_western,
    delta_t_seconds,
    is_on_cusp,
    julian_day,
    mean_obliquity,
    mean_sidereal_time,
    moon_longitude,
    nutation,
    sign_of,
    sun_longitude,
    sun_sign_for_date,
    zodiac_point,
)
from app.charts.schemas import WESTERN_SIGNS, WesternChart

START = datetime(1900, 1, 1, tzinfo=UTC)
END = datetime(2100, 12, 31, 23, 59, tzinfo=UTC)
CONTRACT_SUN_TOLERANCE = 0.01
CONTRACT_MOON_TOLERANCE = 0.05
CONTRACT_ASCENDANT_TOLERANCE = 0.1


def angular_difference(a: float, b: float) -> float:
    """Signed smallest difference a - b in degrees, handling the 360 wrap."""
    return (a - b + 180.0) % 360.0 - 180.0


def random_instants(seed: int, count: int) -> list[datetime]:
    rng = random.Random(seed)
    span = (END - START).total_seconds()
    return [START + timedelta(seconds=rng.uniform(0, span)) for _ in range(count)]


def ephem_date(moment: datetime) -> ephem.Date:
    return ephem.Date(moment.astimezone(UTC).replace(tzinfo=None))


def ephem_apparent_longitude(body: ephem.Body, moment: datetime) -> float:
    d = ephem_date(moment)
    body.compute(d)
    return math.degrees(ephem.Ecliptic(ephem.Equatorial(body.ra, body.dec, epoch=d), epoch=d).lon)


def ephem_alt_az(ecliptic_longitude: float, moment: datetime, latitude: float, longitude: float) -> tuple[float, float]:
    """Altitude/azimuth (degrees) of the ecliptic point (latitude 0) seen from a place, no refraction."""
    d = ephem_date(moment)
    equatorial = ephem.Equatorial(ephem.Ecliptic(math.radians(ecliptic_longitude), 0, epoch=d), epoch=d)
    observer = ephem.Observer()
    observer.date = d
    observer.epoch = d
    observer.lat = math.radians(latitude)
    observer.lon = math.radians(longitude)
    observer.elevation = 0
    observer.pressure = 0  # disables refraction
    point = ephem.FixedBody()
    point._ra, point._dec, point._epoch = equatorial.ra, equatorial.dec, d
    point.compute(observer)
    return math.degrees(point.alt), math.degrees(point.az)


def ephem_rising_ecliptic_longitude(guess: float, moment: datetime, latitude: float, longitude: float) -> float:
    """Ecliptic longitude on the horizon near ``guess``, found by bisection on PyEphem altitudes."""
    low, high = guess - 0.5, guess + 0.5
    alt_low = ephem_alt_az(low, moment, latitude, longitude)[0]
    alt_high = ephem_alt_az(high, moment, latitude, longitude)[0]
    assert alt_low * alt_high < 0, "no horizon crossing within 0.5 deg of the computed ascendant"
    for _ in range(30):
        middle = (low + high) / 2
        alt_middle = ephem_alt_az(middle, moment, latitude, longitude)[0]
        if (alt_middle < 0) == (alt_low < 0):
            low, alt_low = middle, alt_middle
        else:
            high = middle
    return (low + high) / 2


# ---------------------------------------------------------------------------------------------
# Time scales (Meeus ch. 7, Espenak & Meeus Delta T)
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (datetime(2000, 1, 1, 12, tzinfo=UTC), 2451545.0),
        (datetime(1957, 10, 4, 19, 26, 24, tzinfo=UTC), 2436116.31),  # Meeus example 7.a
        (datetime(1987, 1, 27, tzinfo=UTC), 2446822.5),
        (datetime(1987, 6, 19, 12, tzinfo=UTC), 2446966.0),
        (datetime(1988, 1, 27, tzinfo=UTC), 2447187.5),
        (datetime(1900, 1, 1, tzinfo=UTC), 2415020.5),
        (datetime(2100, 3, 1, tzinfo=UTC), 2488128.5),
    ],
)
def test_julian_day(moment, expected):
    assert julian_day(moment) == pytest.approx(expected, abs=1e-6)


def test_julian_day_matches_elapsed_time_and_accepts_any_offset():
    for moment in random_instants(seed=7, count=200):
        elapsed = (moment - datetime(2000, 1, 1, 12, tzinfo=UTC)).total_seconds() / 86400
        assert julian_day(moment) == pytest.approx(2451545.0 + elapsed, abs=1e-8)
    cairo = datetime(1990, 8, 17, 14, 30, tzinfo=timezone(timedelta(hours=3)))
    assert julian_day(cairo) == julian_day(datetime(1990, 8, 17, 11, 30, tzinfo=UTC))


@pytest.mark.parametrize("func", [julian_day, sun_longitude, moon_longitude])
def test_naive_datetimes_are_rejected(func):
    with pytest.raises(ValueError, match="aware"):
        func(datetime(2000, 1, 1, 12))


@pytest.mark.parametrize(
    ("year", "expected", "tolerance"),
    [
        (1900.0, -2.79, 0.01),
        (1950.0, 29.07, 0.01),
        (1975.0, 45.45, 0.01),
        (2000.0, 63.86, 0.01),
        (2010.0, 66.7, 1.0),  # observed ~66.1 s
        (2024.0, 72.0, 3.0),  # observed ~69.2 s; the polynomial predicts ~73.9 s
    ],
)
def test_delta_t_values(year, expected, tolerance):
    assert delta_t_seconds(year) == pytest.approx(expected, abs=tolerance)


@pytest.mark.parametrize("boundary", [1900, 1920, 1941, 1961, 1986, 2005, 2050, 2150])
def test_delta_t_is_continuous_across_polynomial_pieces(boundary):
    assert abs(delta_t_seconds(boundary - 1e-9) - delta_t_seconds(boundary)) < 0.1


# ---------------------------------------------------------------------------------------------
# Meeus worked examples
# ---------------------------------------------------------------------------------------------


def test_nutation_and_obliquity_meeus_example_22a():
    nut = nutation(2446895.5)  # 1987 April 10, 0h TD
    assert nut.delta_psi * 3600 == pytest.approx(-3.788, abs=0.001)
    assert nut.delta_epsilon * 3600 == pytest.approx(9.443, abs=0.001)
    assert nut.mean_obliquity == pytest.approx(23 + 26 / 60 + 27.407 / 3600, abs=0.001 / 3600)
    assert nut.true_obliquity == pytest.approx(23 + 26 / 60 + 36.850 / 3600, abs=0.001 / 3600)
    assert mean_obliquity(2451545.0) == pytest.approx(23 + 26 / 60 + 21.448 / 3600, abs=1e-9)


def test_sidereal_time_meeus_examples_12a_12b():
    nut = nutation(2446895.5)
    assert mean_sidereal_time(2446895.5) == pytest.approx(197.693195, abs=1e-6)
    apparent_hours = apparent_sidereal_time(2446895.5, nut) / 15
    assert apparent_hours == pytest.approx(13 + 10 / 60 + 46.1351 / 3600, abs=0.0002 / 3600)
    assert mean_sidereal_time(2446896.30625) == pytest.approx(128.7378734, abs=1e-6)


def test_sun_meeus_example_25b():
    # 1992 October 13, 0h TD: apparent longitude 199deg54'21.818" with VSOP87.
    jde = 2448908.5
    assert western._sun_apparent_longitude(jde, nutation(jde)) == pytest.approx(
        199 + 54 / 60 + 21.818 / 3600, abs=0.01 / 3600
    )


def test_moon_meeus_example_47a():
    # 1992 April 12, 0h TD: lambda = 133.162655, apparent lambda = 133.167265.
    jde = 2448724.5
    assert western._moon_geometric_longitude(jde) % 360 == pytest.approx(133.162655, abs=2e-6)
    assert western._moon_apparent_longitude(jde, nutation(jde)) == pytest.approx(133.167265, abs=2e-6)


# ---------------------------------------------------------------------------------------------
# Accuracy against PyEphem, 1900-2100
# ---------------------------------------------------------------------------------------------


def test_sun_longitude_matches_ephem():
    errors = [
        abs(angular_difference(sun_longitude(m), ephem_apparent_longitude(ephem.Sun(), m)))
        for m in random_instants(seed=2024, count=400)
    ]
    assert max(errors) <= CONTRACT_SUN_TOLERANCE
    assert max(errors) < 0.001  # actual accuracy ~1.5"; a typo in the VSOP87 tables would show here


def test_moon_longitude_matches_ephem():
    errors = [
        abs(angular_difference(moon_longitude(m), ephem_apparent_longitude(ephem.Moon(), m)))
        for m in random_instants(seed=1969, count=400)
    ]
    assert max(errors) <= CONTRACT_MOON_TOLERANCE
    assert max(errors) < 0.015  # actual accuracy ~20"


def test_ascendant_is_on_the_eastern_horizon():
    rng = random.Random(42)
    for moment in random_instants(seed=42, count=300):
        latitude, longitude = rng.uniform(-60, 60), rng.uniform(-180, 180)
        asc = ascendant_longitude(moment, latitude, longitude)
        altitude, azimuth = ephem_alt_az(asc, moment, latitude, longitude)
        assert abs(altitude) < 0.1, (moment, latitude, longitude)
        assert 0 < azimuth < 180, (moment, latitude, longitude)


def test_ascendant_longitude_matches_ephem_horizon_crossing():
    rng = random.Random(99)
    for moment in random_instants(seed=99, count=60):
        latitude, longitude = rng.uniform(-60, 60), rng.uniform(-180, 180)
        asc = ascendant_longitude(moment, latitude, longitude)
        reference = ephem_rising_ecliptic_longitude(asc, moment, latitude, longitude)
        assert abs(angular_difference(asc, reference)) <= CONTRACT_ASCENDANT_TOLERANCE / 2


@pytest.mark.parametrize("latitude", [66.7, 69.65, 78.22, -68.5, -77.85])
def test_ascendant_inside_polar_circles_is_still_the_rising_point(latitude):
    # The textbook atan2 formula returns the *setting* point for part of the sidereal day here.
    rng = random.Random(int(latitude * 100))
    for moment in random_instants(seed=int(latitude * 100), count=60):
        longitude = rng.uniform(-180, 180)
        asc = ascendant_longitude(moment, latitude, longitude)
        altitude, azimuth = ephem_alt_az(asc, moment, latitude, longitude)
        assert abs(altitude) < 0.1
        assert 0 < azimuth < 180


@pytest.mark.parametrize(
    ("local_sidereal_time", "expected"),
    [(0.0, 90.0), (90.0, 180.0), (180.0, 270.0), (270.0, 0.0)],
)
def test_ascendant_at_equator_textbook_values(local_sidereal_time, expected):
    # On the equator with the equinox on the meridian, 0 Cancer / 0 Libra / ... rise exactly.
    asc = western._ascendant(local_sidereal_time, 0.0, 23.44)
    assert abs(angular_difference(asc, expected)) < 1e-9


@pytest.mark.parametrize(
    ("latitude", "longitude", "day"),
    [(30.06, 31.25, date(1990, 8, 17)), (51.51, -0.13, date(2024, 12, 21)), (-33.87, 151.21, date(2005, 3, 1))],
)
def test_ascendant_equals_sun_longitude_at_sunrise(latitude, longitude, day):
    observer = ephem.Observer()
    observer.lat, observer.lon = math.radians(latitude), math.radians(longitude)
    observer.pressure, observer.horizon, observer.date = 0, 0, ephem.Date(day)
    sunrise = observer.next_rising(ephem.Sun(), use_center=True).datetime().replace(tzinfo=UTC)
    assert abs(angular_difference(ascendant_longitude(sunrise, latitude, longitude), sun_longitude(sunrise))) < 0.05


# ---------------------------------------------------------------------------------------------
# Known events
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ingress", "before", "after"),
    [
        (datetime(2024, 3, 20, 3, 6, tzinfo=UTC), "pisces", "aries"),  # March equinox 03:06 UTC
        (datetime(2024, 6, 20, 20, 51, tzinfo=UTC), "gemini", "cancer"),  # June solstice 20:51 UTC
        (datetime(2024, 12, 21, 9, 20, tzinfo=UTC), "sagittarius", "capricorn"),  # December solstice
        (datetime(2000, 3, 20, 7, 35, tzinfo=UTC), "pisces", "aries"),
    ],
)
def test_sun_sign_ingress_times(ingress, before, after):
    assert sign_of(sun_longitude(ingress - timedelta(minutes=3))) == before
    assert sign_of(sun_longitude(ingress + timedelta(minutes=3))) == after


def test_equinoxes_and_solstices_from_ephem_1900_2100():
    events = (
        (ephem.next_vernal_equinox, 0.0),
        (ephem.next_summer_solstice, 90.0),
        (ephem.next_autumnal_equinox, 180.0),
        (ephem.next_winter_solstice, 270.0),
    )
    for year in range(1900, 2101, 9):
        for finder, expected in events:
            moment = finder(str(year)).datetime().replace(tzinfo=UTC)
            assert abs(angular_difference(sun_longitude(moment), expected)) < 0.001, (year, expected)


def test_full_and_new_moons_from_ephem():
    d = ephem.Date("1950/1/1")
    for _ in range(40):
        d = ephem.next_full_moon(d)
        full = d.datetime().replace(tzinfo=UTC)
        assert abs(angular_difference(moon_longitude(full) - sun_longitude(full), 180.0)) < 0.02
        d = ephem.next_new_moon(d)
        new = d.datetime().replace(tzinfo=UTC)
        assert abs(angular_difference(moon_longitude(new), sun_longitude(new))) < 0.02
        d = ephem.Date(d + 365 * 1.9)


def test_daily_motion_is_plausible():
    for moment in random_instants(seed=5, count=100):
        one_day_later = moment + timedelta(days=1)
        sun_motion = angular_difference(sun_longitude(one_day_later), sun_longitude(moment))
        moon_motion = angular_difference(moon_longitude(one_day_later), moon_longitude(moment))
        assert 0.95 < sun_motion < 1.02
        assert 11.7 < moon_motion < 15.5


# ---------------------------------------------------------------------------------------------
# Signs and zodiac points
# ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("longitude", "sign"),
    [
        (0.0, "aries"),
        (29.999999, "aries"),
        (30.0, "taurus"),
        (144.3, "leo"),
        (359.999, "pisces"),
        (360.0, "aries"),
        (-0.5, "pisces"),
        (720.5, "aries"),
        (-1e-15, "aries"),  # rounds to 360.0 in floating point, i.e. 0 Aries
    ],
)
def test_sign_of(longitude, sign):
    assert sign_of(longitude) == sign


def test_every_sign_covers_thirty_degrees():
    for index, sign in enumerate(WESTERN_SIGNS):
        assert sign_of(index * 30 + 0.001) == sign
        assert sign_of(index * 30 + 29.999) == sign


@pytest.mark.parametrize(
    ("longitude", "sign", "normalized", "degree"),
    [
        (144.308319, "leo", 144.308319, 24.308319),
        (0.0, "aries", 0.0, 0.0),
        (359.9999996, "aries", 0.0, 0.0),  # rounds to 360 -> 0 Aries, never an invalid 360
        (59.9999994, "taurus", 59.999999, 29.999999),
        (-30.25, "aquarius", 329.75, 29.75),
        (390.5, "taurus", 30.5, 0.5),
    ],
)
def test_zodiac_point(longitude, sign, normalized, degree):
    point = zodiac_point(longitude)
    assert point.sign == sign
    assert point.longitude == pytest.approx(normalized, abs=1e-9)
    assert point.degree_in_sign == pytest.approx(degree, abs=1e-9)


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_zodiac_point_rejects_non_finite(value):
    with pytest.raises(ValueError):
        zodiac_point(value)


@pytest.mark.parametrize(
    ("longitude", "expected"),
    [(0.5, True), (29.5, True), (359.2, True), (30.99, True), (1.0, False), (15.0, False), (29.0, False)],
)
def test_is_on_cusp(longitude, expected):
    assert is_on_cusp(longitude) is expected


# ---------------------------------------------------------------------------------------------
# compute_western
# ---------------------------------------------------------------------------------------------


def test_compute_western_cairo_1990():
    # 1990-08-17 14:30 Cairo summer time (UTC+3).
    moment = datetime(1990, 8, 17, 11, 30, tzinfo=UTC)
    chart = compute_western(moment, 30.06263, 31.24967)
    assert isinstance(chart, WesternChart)
    assert chart.zodiac == "tropical"
    assert (chart.sun.sign, chart.moon.sign, chart.ascendant.sign) == ("leo", "cancer", "sagittarius")
    assert chart.sun.degree_in_sign == pytest.approx(24.308, abs=0.002)
    assert chart.sun_on_cusp is False
    assert chart.sun.longitude == pytest.approx(sun_longitude(moment), abs=1e-6)
    assert chart.moon.longitude == pytest.approx(moon_longitude(moment), abs=1e-6)
    assert chart.ascendant.longitude == pytest.approx(ascendant_longitude(moment, 30.06263, 31.24967), abs=1e-6)
    dumped = chart.model_dump(mode="json")
    assert set(dumped) == {"zodiac", "sun", "moon", "ascendant", "sun_on_cusp"}
    assert WesternChart.model_validate(dumped) == chart


def test_compute_western_flags_sun_on_cusp():
    assert compute_western(datetime(2024, 3, 20, 3, 6, tzinfo=UTC), 51.5, -0.13).sun_on_cusp is True
    assert compute_western(datetime(2024, 4, 4, 12, tzinfo=UTC), 51.5, -0.13).sun_on_cusp is False


def test_compute_western_same_instant_in_any_offset():
    utc_moment = datetime(1985, 1, 1, 6, 15, tzinfo=UTC)
    kathmandu = utc_moment.astimezone(timezone(timedelta(hours=5, minutes=45)))
    assert compute_western(kathmandu, 27.7, 85.3) == compute_western(utc_moment, 27.7, 85.3)


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(90.1, 0.0), (-91.0, 0.0), (0.0, 180.5), (0.0, -181.0), (math.nan, 0.0), (0.0, math.inf)],
)
def test_invalid_coordinates_are_rejected(latitude, longitude):
    moment = datetime(2000, 1, 1, tzinfo=UTC)
    with pytest.raises(ValueError):
        compute_western(moment, latitude, longitude)
    with pytest.raises(ValueError):
        ascendant_longitude(moment, latitude, longitude)


def test_compute_western_rejects_naive_datetime():
    with pytest.raises(ValueError):
        compute_western(datetime(2000, 1, 1), 0.0, 0.0)


@pytest.mark.parametrize(("latitude", "longitude"), [(89.99, 0.0), (-89.99, 179.9), (0.0, -180.0), (0.0, 180.0)])
def test_extreme_but_valid_coordinates(latitude, longitude):
    chart = compute_western(datetime(2000, 6, 1, tzinfo=UTC), latitude, longitude)
    assert 0 <= chart.ascendant.longitude < 360


def test_compute_western_is_fast():
    moments = random_instants(seed=11, count=200)
    started = timer.perf_counter()
    for moment in moments:
        compute_western(moment, 30.0, 31.0)
    assert timer.perf_counter() - started < 2.0


# ---------------------------------------------------------------------------------------------
# sun_sign_for_date (free plan: date only)
# ---------------------------------------------------------------------------------------------


def test_sun_sign_for_date_on_ingress_day_returns_alternative():
    assert sun_sign_for_date(date(2024, 3, 20)) == ("aries", "pisces")


def test_sun_sign_for_date_mid_sign():
    assert sun_sign_for_date(date(1990, 8, 17)) == ("leo", None)
    assert sun_sign_for_date(date(2024, 3, 25)) == ("aries", None)


def test_sun_sign_for_date_counts_the_whole_world_day():
    # On 19 March 2024 it was already Aries in Hawaii (UTC-10) late in the evening.
    assert sun_sign_for_date(date(2024, 3, 19)) == ("pisces", "aries")
    assert sun_sign_for_date(date(2024, 3, 21)) == ("aries", None)


def test_sun_sign_for_date_whole_year():
    day = date(2024, 1, 1)
    primaries: set[str] = set()
    ambiguous_days = 0
    while day.year == 2024:
        sign, alternative = sun_sign_for_date(day)
        primaries.add(sign)
        if alternative is not None:
            ambiguous_days += 1
            assert alternative != sign
            index = WESTERN_SIGNS.index(sign)
            assert alternative in (WESTERN_SIGNS[index - 1], WESTERN_SIGNS[(index + 1) % 12])
        # Whatever the birthplace's offset, local noon falls on one of the returned signs.
        for offset_hours in (-12, -5, 0, 3, 8, 14):
            local_noon = datetime(day.year, day.month, day.day, 12, tzinfo=timezone(timedelta(hours=offset_hours)))
            assert sign_of(sun_longitude(local_noon)) in (sign, alternative)
        day += timedelta(days=1)
    assert primaries == set(WESTERN_SIGNS)
    # The 50-hour window around each of the 12 ingresses touches two or three dates.
    assert 24 <= ambiguous_days <= 36


@pytest.mark.parametrize("day", [date(1900, 1, 1), date(2100, 12, 31), date(2000, 2, 29)])
def test_sun_sign_for_date_range_edges(day):
    sign, alternative = sun_sign_for_date(day)
    assert sign in WESTERN_SIGNS
    assert alternative is None
