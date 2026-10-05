"""Western (tropical) chart points: apparent geocentric Sun, Moon and the Ascendant.

Pure-Python implementation of Jean Meeus, *Astronomical Algorithms* (2nd ed., 1998):

* ch. 7  Julian day                      * ch. 12 apparent sidereal time
* ch. 22 nutation (IAU 1980, 63 terms)   * ch. 25/32 + App. III  Sun from truncated VSOP87
* ch. 47 Moon (full tables 47.A)         * Delta T: Espenak & Meeus polynomial expressions

Positions are referred to the true equinox of date (tropical zodiac). Worst case against an
independent ephemeris over 1900-2100 (see tests): Sun 0.0004 deg, Moon 0.006 deg, Ascendant 0.011 deg,
all well inside the contract targets (0.01 / 0.05 / 0.1 deg). Civil UTC stands in for UT1
(|UT1-UTC| < 0.9 s), which moves the Ascendant by well under 0.01 deg.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from app.charts.schemas import WESTERN_SIGNS, WesternChart, WesternSign, ZodiacPoint

J2000 = 2451545.0
DAYS_PER_JULIAN_CENTURY = 36525.0
SECONDS_PER_DAY = 86400.0
ARCSEC = 1.0 / 3600.0  # degrees
SIGN_WIDTH = 30.0
CUSP_ORB = 1.0  # degrees from a sign boundary that count as "on the cusp"

# Calendar-date span for sun_sign_for_date: the date exists somewhere on Earth from
# 00:00 at UTC+14 (Line Islands) until 24:00 at UTC-12 (Baker Island).
_EARLIEST_OFFSET = timedelta(hours=14)
_LATEST_OFFSET = timedelta(hours=-12)


# --------------------------------------------------------------------------------------------
# Time scales
# --------------------------------------------------------------------------------------------


def _as_utc(utc: datetime) -> datetime:
    if utc.tzinfo is None or utc.utcoffset() is None:
        raise ValueError("datetime must be timezone-aware")
    return utc.astimezone(UTC)


def julian_day(utc: datetime) -> float:
    """Julian Day (UT) of an aware datetime, Meeus formula 7.1 (Gregorian calendar)."""
    moment = _as_utc(utc)
    year, month = moment.year, moment.month
    if month <= 2:
        year -= 1
        month += 12
    century = year // 100
    gregorian_shift = 2 - century + century // 4
    seconds = moment.hour * 3600 + moment.minute * 60 + moment.second + moment.microsecond / 1e6
    day = moment.day + seconds / SECONDS_PER_DAY
    return math.floor(365.25 * (year + 4716)) + math.floor(30.6001 * (month + 1)) + day + gregorian_shift - 1524.5


def _delta_t_long_term(year: float) -> float:
    u = (year - 1820) / 100
    return -20 + 32 * u * u


def delta_t_seconds(year: float) -> float:
    """TT - UT in seconds for a decimal year (Espenak & Meeus, NASA eclipse polynomials).

    Pieces cover 1800-2150 (the product needs 1900-2100); outside that range only the rough
    long-term parabola is used (it does not join the 1800 piece smoothly).
    """
    y = year
    if y < 1800 or y >= 2150:
        return _delta_t_long_term(y)
    if y < 1860:
        t = y - 1800
        return (
            13.72
            - 0.332447 * t
            + 0.0068612 * t**2
            + 0.0041116 * t**3
            - 0.00037436 * t**4
            + 0.0000121272 * t**5
            - 0.0000001699 * t**6
            + 0.000000000875 * t**7
        )
    if y < 1900:
        t = y - 1860
        return 7.62 + 0.5737 * t - 0.251754 * t**2 + 0.01680668 * t**3 - 0.0004473624 * t**4 + t**5 / 233174
    if y < 1920:
        t = y - 1900
        return -2.79 + 1.494119 * t - 0.0598939 * t**2 + 0.0061966 * t**3 - 0.000197 * t**4
    if y < 1941:
        t = y - 1920
        return 21.20 + 0.84493 * t - 0.076100 * t**2 + 0.0020936 * t**3
    if y < 1961:
        t = y - 1950
        return 29.07 + 0.407 * t - t**2 / 233 + t**3 / 2547
    if y < 1986:
        t = y - 1975
        return 45.45 + 1.067 * t - t**2 / 260 - t**3 / 718
    if y < 2005:
        t = y - 2000
        return 63.86 + 0.3345 * t - 0.060374 * t**2 + 0.0017275 * t**3 + 0.000651814 * t**4 + 0.00002373599 * t**5
    if y < 2050:
        t = y - 2000
        return 62.92 + 0.32217 * t + 0.005589 * t**2
    return _delta_t_long_term(y) - 0.5628 * (2150 - y)


def _decimal_year(jd: float) -> float:
    return 2000.0 + (jd - J2000) / 365.25


def _centuries(jd: float) -> float:
    return (jd - J2000) / DAYS_PER_JULIAN_CENTURY


# --------------------------------------------------------------------------------------------
# Nutation and obliquity (Meeus ch. 22, IAU 1980 theory)
# --------------------------------------------------------------------------------------------

# Multipliers of (D, M, M', F, Omega) and coefficients in 0.0001":
# delta_psi += (a + b*T) * sin(arg), delta_eps += (c + d*T) * cos(arg)   (Meeus table 22.A)
_NUTATION_TERMS: tuple[tuple[int, int, int, int, int, float, float, float, float], ...] = (
    (0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9),
    (-2, 0, 0, 2, 2, -13187, -1.6, 5736, -3.1),
    (0, 0, 0, 2, 2, -2274, -0.2, 977, -0.5),
    (0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5),
    (0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1),
    (0, 0, 1, 0, 0, 712, 0.1, -7, 0),
    (-2, 1, 0, 2, 2, -517, 1.2, 224, -0.6),
    (0, 0, 0, 2, 1, -386, -0.4, 200, 0),
    (0, 0, 1, 2, 2, -301, 0, 129, -0.1),
    (-2, -1, 0, 2, 2, 217, -0.5, -95, 0.3),
    (-2, 0, 1, 0, 0, -158, 0, 0, 0),
    (-2, 0, 0, 2, 1, 129, 0.1, -70, 0),
    (0, 0, -1, 2, 2, 123, 0, -53, 0),
    (2, 0, 0, 0, 0, 63, 0, 0, 0),
    (0, 0, 1, 0, 1, 63, 0.1, -33, 0),
    (2, 0, -1, 2, 2, -59, 0, 26, 0),
    (0, 0, -1, 0, 1, -58, -0.1, 32, 0),
    (0, 0, 1, 2, 1, -51, 0, 27, 0),
    (-2, 0, 2, 0, 0, 48, 0, 0, 0),
    (0, 0, -2, 2, 1, 46, 0, -24, 0),
    (2, 0, 0, 2, 2, -38, 0, 16, 0),
    (0, 0, 2, 2, 2, -31, 0, 13, 0),
    (0, 0, 2, 0, 0, 29, 0, 0, 0),
    (-2, 0, 1, 2, 2, 29, 0, -12, 0),
    (0, 0, 0, 2, 0, 26, 0, 0, 0),
    (-2, 0, 0, 2, 0, -22, 0, 0, 0),
    (0, 0, -1, 2, 1, 21, 0, -10, 0),
    (0, 2, 0, 0, 0, 17, -0.1, 0, 0),
    (2, 0, -1, 0, 1, 16, 0, -8, 0),
    (-2, 2, 0, 2, 2, -16, 0.1, 7, 0),
    (0, 1, 0, 0, 1, -15, 0, 9, 0),
    (-2, 0, 1, 0, 1, -13, 0, 7, 0),
    (0, -1, 0, 0, 1, -12, 0, 6, 0),
    (0, 0, 2, -2, 0, 11, 0, 0, 0),
    (2, 0, -1, 2, 1, -10, 0, 5, 0),
    (2, 0, 1, 2, 2, -8, 0, 3, 0),
    (0, 1, 0, 2, 2, 7, 0, -3, 0),
    (-2, 1, 1, 0, 0, -7, 0, 0, 0),
    (0, -1, 0, 2, 2, -7, 0, 3, 0),
    (2, 0, 0, 2, 1, -7, 0, 3, 0),
    (2, 0, 1, 0, 0, 6, 0, 0, 0),
    (-2, 0, 2, 2, 2, 6, 0, -3, 0),
    (-2, 0, 1, 2, 1, 6, 0, -3, 0),
    (2, 0, -2, 0, 1, -6, 0, 3, 0),
    (2, 0, 0, 0, 1, -6, 0, 3, 0),
    (0, -1, 1, 0, 0, 5, 0, 0, 0),
    (-2, -1, 0, 2, 1, -5, 0, 3, 0),
    (-2, 0, 0, 0, 1, -5, 0, 3, 0),
    (0, 0, 2, 2, 1, -5, 0, 3, 0),
    (-2, 0, 2, 0, 1, 4, 0, 0, 0),
    (-2, 1, 0, 2, 1, 4, 0, 0, 0),
    (0, 0, 1, -2, 0, 4, 0, 0, 0),
    (-1, 0, 1, 0, 0, -4, 0, 0, 0),
    (-2, 1, 0, 0, 0, -4, 0, 0, 0),
    (1, 0, 0, 0, 0, -4, 0, 0, 0),
    (0, 0, 1, 2, 0, 3, 0, 0, 0),
    (0, 0, -2, 2, 2, -3, 0, 0, 0),
    (-1, -1, 1, 0, 0, -3, 0, 0, 0),
    (0, 1, 1, 0, 0, -3, 0, 0, 0),
    (0, -1, 1, 2, 2, -3, 0, 0, 0),
    (2, -1, -1, 2, 2, -3, 0, 0, 0),
    (0, 0, 3, 2, 2, -3, 0, 0, 0),
    (2, -1, 0, 2, 2, -3, 0, 0, 0),
)


@dataclass(frozen=True)
class Nutation:
    delta_psi: float  # nutation in longitude, degrees
    delta_epsilon: float  # nutation in obliquity, degrees
    mean_obliquity: float  # degrees

    @property
    def true_obliquity(self) -> float:
        return self.mean_obliquity + self.delta_epsilon


def mean_obliquity(jde: float) -> float:
    """Mean obliquity of the ecliptic in degrees (Meeus 22.2)."""
    t = _centuries(jde)
    seconds = 21.448 - 46.8150 * t - 0.00059 * t**2 + 0.001813 * t**3
    return 23.0 + 26.0 / 60.0 + seconds / 3600.0


def nutation(jde: float) -> Nutation:
    """Nutation in longitude and obliquity plus mean obliquity at ``jde`` (Meeus ch. 22)."""
    t = _centuries(jde)
    elongation = math.radians(297.85036 + 445267.111480 * t - 0.0019142 * t**2 + t**3 / 189474)
    sun_anomaly = math.radians(357.52772 + 35999.050340 * t - 0.0001603 * t**2 - t**3 / 300000)
    moon_anomaly = math.radians(134.96298 + 477198.867398 * t + 0.0086972 * t**2 + t**3 / 56250)
    latitude_arg = math.radians(93.27191 + 483202.017538 * t - 0.0036825 * t**2 + t**3 / 327270)
    node = math.radians(125.04452 - 1934.136261 * t + 0.0020708 * t**2 + t**3 / 450000)

    psi = eps = 0.0
    for kd, km, kmp, kf, ko, a, b, c, d in _NUTATION_TERMS:
        arg = kd * elongation + km * sun_anomaly + kmp * moon_anomaly + kf * latitude_arg + ko * node
        psi += (a + b * t) * math.sin(arg)
        eps += (c + d * t) * math.cos(arg)
    return Nutation(
        delta_psi=psi * 0.0001 * ARCSEC,
        delta_epsilon=eps * 0.0001 * ARCSEC,
        mean_obliquity=mean_obliquity(jde),
    )


# --------------------------------------------------------------------------------------------
# Sun: Earth's heliocentric longitude and radius vector from truncated VSOP87
# (Meeus Appendix III). Each term is (A, B, C): A * cos(B + C * tau), tau in Julian millennia TT.
# --------------------------------------------------------------------------------------------

_Series = tuple[tuple[float, float, float], ...]

_EARTH_L0: _Series = (
    (175347046.0, 0.0, 0.0),
    (3341656.0, 4.6692568, 6283.07585),
    (34894.0, 4.6261, 12566.1517),
    (3497.0, 2.7441, 5753.3849),
    (3418.0, 2.8289, 3.5231),
    (3136.0, 3.6277, 77713.7715),
    (2676.0, 4.4181, 7860.4194),
    (2343.0, 6.1352, 3930.2097),
    (1324.0, 0.7425, 11506.7698),
    (1273.0, 2.0371, 529.6910),
    (1199.0, 1.1096, 1577.3435),
    (990.0, 5.233, 5884.927),
    (902.0, 2.045, 26.298),
    (857.0, 3.508, 398.149),
    (780.0, 1.179, 5223.694),
    (753.0, 2.533, 5507.553),
    (505.0, 4.583, 18849.228),
    (492.0, 4.205, 775.523),
    (357.0, 2.920, 0.067),
    (317.0, 5.849, 11790.629),
    (284.0, 1.899, 796.298),
    (271.0, 0.315, 10977.079),
    (243.0, 0.345, 5486.778),
    (206.0, 4.806, 2544.314),
    (205.0, 1.869, 5573.143),
    (202.0, 2.458, 6069.777),
    (156.0, 0.833, 213.299),
    (132.0, 3.411, 2942.463),
    (126.0, 1.083, 20.775),
    (115.0, 0.645, 0.980),
    (103.0, 0.636, 4694.003),
    (102.0, 0.976, 15720.839),
    (102.0, 4.267, 7.114),
    (99.0, 6.21, 2146.17),
    (98.0, 0.68, 155.42),
    (86.0, 5.98, 161000.69),
    (85.0, 1.30, 6275.96),
    (85.0, 3.67, 71430.70),
    (80.0, 1.81, 17260.15),
    (79.0, 3.04, 12036.46),
    (75.0, 1.76, 5088.63),
    (74.0, 3.50, 3154.69),
    (74.0, 4.68, 801.82),
    (70.0, 0.83, 9437.76),
    (62.0, 3.98, 8827.39),
    (61.0, 1.82, 7084.90),
    (57.0, 2.78, 6286.60),
    (56.0, 4.39, 14143.50),
    (56.0, 3.47, 6279.55),
    (52.0, 0.19, 12139.55),
    (52.0, 1.33, 1748.02),
    (51.0, 0.28, 5856.48),
    (49.0, 0.49, 1194.45),
    (41.0, 5.37, 8429.24),
    (41.0, 2.40, 19651.05),
    (39.0, 6.17, 10447.39),
    (37.0, 6.04, 10213.29),
    (37.0, 2.57, 1059.38),
    (36.0, 1.71, 2352.87),
    (36.0, 1.78, 6812.77),
    (33.0, 0.59, 17789.85),
    (30.0, 0.44, 83996.85),
    (30.0, 2.74, 1349.87),
    (25.0, 3.16, 4690.48),
)
_EARTH_L1: _Series = (
    (628331966747.0, 0.0, 0.0),
    (206059.0, 2.678235, 6283.07585),
    (4303.0, 2.6351, 12566.1517),
    (425.0, 1.590, 3.523),
    (119.0, 5.796, 26.298),
    (109.0, 2.966, 1577.344),
    (93.0, 2.59, 18849.23),
    (72.0, 1.14, 529.69),
    (68.0, 1.87, 398.15),
    (67.0, 4.41, 5507.55),
    (59.0, 2.89, 5223.69),
    (56.0, 2.17, 155.42),
    (45.0, 0.40, 796.30),
    (36.0, 0.47, 775.52),
    (29.0, 2.65, 7.11),
    (21.0, 5.34, 0.98),
    (19.0, 1.85, 5486.78),
    (19.0, 4.97, 213.30),
    (17.0, 2.99, 6275.96),
    (16.0, 0.03, 2544.31),
    (16.0, 1.43, 2146.17),
    (15.0, 1.21, 10977.08),
    (12.0, 2.83, 1748.02),
    (12.0, 3.26, 5088.63),
    (12.0, 5.27, 1194.45),
    (12.0, 2.08, 4694.00),
    (11.0, 0.77, 553.57),
    (10.0, 1.30, 6286.60),
    (10.0, 4.24, 1349.87),
    (9.0, 2.70, 242.73),
    (9.0, 5.64, 951.72),
    (8.0, 5.30, 2352.87),
    (6.0, 2.65, 9437.76),
    (6.0, 4.67, 4690.48),
)
_EARTH_L2: _Series = (
    (52919.0, 0.0, 0.0),
    (8720.0, 1.0721, 6283.0758),
    (309.0, 0.867, 12566.152),
    (27.0, 0.05, 3.52),
    (16.0, 5.19, 26.30),
    (16.0, 3.68, 155.42),
    (10.0, 0.76, 18849.23),
    (9.0, 2.06, 77713.77),
    (7.0, 0.83, 775.52),
    (5.0, 4.66, 1577.34),
    (4.0, 1.03, 7.11),
    (4.0, 3.44, 5573.14),
    (3.0, 5.14, 796.30),
    (3.0, 6.05, 5507.55),
    (3.0, 1.19, 242.73),
    (3.0, 6.12, 529.69),
    (3.0, 0.31, 398.15),
    (3.0, 2.28, 553.57),
    (2.0, 4.38, 5223.69),
    (2.0, 3.75, 0.98),
)
_EARTH_L3: _Series = (
    (289.0, 5.844, 6283.076),
    (35.0, 0.0, 0.0),
    (17.0, 5.49, 12566.15),
    (3.0, 5.20, 155.42),
    (1.0, 4.72, 3.52),
    (1.0, 5.30, 18849.23),
    (1.0, 5.97, 242.73),
)
_EARTH_L4: _Series = (
    (114.0, 3.142, 0.0),
    (8.0, 4.13, 6283.08),
    (1.0, 3.84, 12566.15),
)
_EARTH_L5: _Series = ((1.0, 3.14, 0.0),)

_EARTH_R0: _Series = (
    (100013989.0, 0.0, 0.0),
    (1670700.0, 3.0984635, 6283.07585),
    (13956.0, 3.05525, 12566.1517),
    (3084.0, 5.1985, 77713.7715),
    (1628.0, 1.1739, 5753.3849),
    (1576.0, 2.8469, 7860.4194),
    (925.0, 5.453, 11506.770),
    (542.0, 4.564, 3930.210),
    (472.0, 3.661, 5884.927),
    (346.0, 0.964, 5507.553),
    (329.0, 5.900, 5223.694),
    (307.0, 0.299, 5573.143),
    (243.0, 4.273, 11790.629),
    (212.0, 5.847, 1577.344),
    (186.0, 5.022, 10977.079),
    (175.0, 3.012, 18849.228),
    (110.0, 5.055, 5486.778),
    (98.0, 0.89, 6069.78),
    (86.0, 5.69, 15720.84),
    (86.0, 1.27, 161000.69),
    (65.0, 0.27, 17260.15),
    (63.0, 0.92, 529.69),
    (57.0, 2.01, 83996.85),
    (56.0, 5.24, 71430.70),
    (49.0, 3.25, 2544.31),
    (47.0, 2.58, 775.52),
    (45.0, 5.54, 9437.76),
    (43.0, 6.01, 6275.96),
    (39.0, 5.36, 4694.00),
    (38.0, 2.39, 8827.39),
    (37.0, 0.83, 19651.05),
    (37.0, 4.90, 12139.55),
    (36.0, 1.67, 12036.46),
    (35.0, 1.84, 2942.46),
    (33.0, 0.24, 7084.90),
    (32.0, 0.18, 5088.63),
    (32.0, 1.78, 398.15),
    (28.0, 1.21, 6286.60),
    (28.0, 1.90, 6279.55),
    (26.0, 4.59, 10447.39),
)
_EARTH_R1: _Series = (
    (103019.0, 1.107490, 6283.075850),
    (1721.0, 1.0644, 12566.1517),
    (702.0, 3.142, 0.0),
    (32.0, 1.02, 18849.23),
    (31.0, 2.84, 5507.55),
    (25.0, 1.32, 5223.69),
    (18.0, 1.42, 1577.34),
    (10.0, 5.91, 10977.08),
    (9.0, 1.42, 6275.96),
    (9.0, 0.27, 5486.78),
)
_EARTH_R2: _Series = (
    (4359.0, 5.7846, 6283.0758),
    (124.0, 5.579, 12566.152),
    (12.0, 3.14, 0.0),
    (9.0, 3.63, 77713.77),
    (6.0, 1.87, 5573.14),
    (3.0, 5.47, 18849.23),
)
_EARTH_R3: _Series = (
    (145.0, 4.273, 6283.076),
    (7.0, 3.92, 12566.15),
)
_EARTH_R4: _Series = ((4.0, 2.56, 6283.08),)

_EARTH_L = (_EARTH_L0, _EARTH_L1, _EARTH_L2, _EARTH_L3, _EARTH_L4, _EARTH_L5)
_EARTH_R = (_EARTH_R0, _EARTH_R1, _EARTH_R2, _EARTH_R3, _EARTH_R4)

_ABERRATION_CONSTANT = 20.4898 * ARCSEC  # degrees x AU
_FK5_LONGITUDE_CORRECTION = -0.09033 * ARCSEC


def _vsop_sum(series: Sequence[_Series], tau: float) -> float:
    total = 0.0
    power = 1.0
    for terms in series:
        total += power * math.fsum(a * math.cos(b + c * tau) for a, b, c in terms)
        power *= tau
    return total / 1e8


def _normalize(degrees: float) -> float:
    value = degrees % 360.0
    # A tiny negative input makes ``% 360`` return exactly 360.0.
    return 0.0 if value >= 360.0 else value


def _sun_apparent_longitude(jde: float, nut: Nutation) -> float:
    tau = (jde - J2000) / 365250.0
    earth_longitude = math.degrees(_vsop_sum(_EARTH_L, tau))
    radius_au = _vsop_sum(_EARTH_R, tau)
    geometric = earth_longitude + 180.0 + _FK5_LONGITUDE_CORRECTION
    return _normalize(geometric + nut.delta_psi - _ABERRATION_CONSTANT / radius_au)


# --------------------------------------------------------------------------------------------
# Moon (Meeus ch. 47). Rows of table 47.A: multipliers of D, M, M', F and the coefficient of
# sin(arg) for the longitude in 1e-6 degrees (the distance column is not needed).
# --------------------------------------------------------------------------------------------

_MOON_LONGITUDE_TERMS: tuple[tuple[int, int, int, int, int], ...] = (
    (0, 0, 1, 0, 6288774),
    (2, 0, -1, 0, 1274027),
    (2, 0, 0, 0, 658314),
    (0, 0, 2, 0, 213618),
    (0, 1, 0, 0, -185116),
    (0, 0, 0, 2, -114332),
    (2, 0, -2, 0, 58793),
    (2, -1, -1, 0, 57066),
    (2, 0, 1, 0, 53322),
    (2, -1, 0, 0, 45758),
    (0, 1, -1, 0, -40923),
    (1, 0, 0, 0, -34720),
    (0, 1, 1, 0, -30383),
    (2, 0, 0, -2, 15327),
    (0, 0, 1, 2, -12528),
    (0, 0, 1, -2, 10980),
    (4, 0, -1, 0, 10675),
    (0, 0, 3, 0, 10034),
    (4, 0, -2, 0, 8548),
    (2, 1, -1, 0, -7888),
    (2, 1, 0, 0, -6766),
    (1, 0, -1, 0, -5163),
    (1, 1, 0, 0, 4987),
    (2, -1, 1, 0, 4036),
    (2, 0, 2, 0, 3994),
    (4, 0, 0, 0, 3861),
    (2, 0, -3, 0, 3665),
    (0, 1, -2, 0, -2689),
    (2, 0, -1, 2, -2602),
    (2, -1, -2, 0, 2390),
    (1, 0, 1, 0, -2348),
    (2, -2, 0, 0, 2236),
    (0, 1, 2, 0, -2120),
    (0, 2, 0, 0, -2069),
    (2, -2, -1, 0, 2048),
    (2, 0, 1, -2, -1773),
    (2, 0, 0, 2, -1595),
    (4, -1, -1, 0, 1215),
    (0, 0, 2, 2, -1110),
    (3, 0, -1, 0, -892),
    (2, 1, 1, 0, -810),
    (4, -1, -2, 0, 759),
    (0, 2, -1, 0, -713),
    (2, 2, -1, 0, -700),
    (2, 1, -2, 0, 691),
    (2, -1, 0, -2, 596),
    (4, 0, 1, 0, 549),
    (0, 0, 4, 0, 537),
    (4, -1, 0, 0, 520),
    (1, 0, -2, 0, -487),
    (2, 1, 0, -2, -399),
    (0, 0, 2, -2, -381),
    (1, 1, 1, 0, 351),
    (3, 0, -2, 0, -340),
    (4, 0, -3, 0, 330),
    (2, -1, 2, 0, 327),
    (0, 2, 1, 0, -323),
    (1, 1, -1, 0, 299),
    (2, 0, 3, 0, 294),
    (2, 0, -1, -2, 0),  # longitude coefficient is zero; kept so the table matches 47.A row for row
)


def _moon_geometric_longitude(jde: float) -> float:
    """Moon's longitude referred to the mean equinox of date (Meeus 47; light-time included)."""
    t = _centuries(jde)
    mean_longitude = 218.3164477 + 481267.88123421 * t - 0.0015786 * t**2 + t**3 / 538841 - t**4 / 65194000
    elongation = 297.8501921 + 445267.1114034 * t - 0.0018819 * t**2 + t**3 / 545868 - t**4 / 113065000
    sun_anomaly = 357.5291092 + 35999.0502909 * t - 0.0001536 * t**2 + t**3 / 24490000
    moon_anomaly = 134.9633964 + 477198.8675055 * t + 0.0087414 * t**2 + t**3 / 69699 - t**4 / 14712000
    latitude_arg = 93.2720950 + 483202.0175233 * t - 0.0036539 * t**2 - t**3 / 3526000 + t**4 / 863310000
    venus_arg = 119.75 + 131.849 * t
    jupiter_arg = 53.09 + 479264.290 * t
    # Eccentricity of Earth's orbit decreases slowly; terms involving M are scaled by E^|k|.
    eccentricity = 1 - 0.002516 * t - 0.0000074 * t**2
    eccentricity_powers = (1.0, eccentricity, eccentricity * eccentricity)

    d, m, mp, f = (math.radians(x) for x in (elongation, sun_anomaly, moon_anomaly, latitude_arg))
    total = 0.0
    for kd, km, kmp, kf, coefficient in _MOON_LONGITUDE_TERMS:
        if coefficient:
            arg = kd * d + km * m + kmp * mp + kf * f
            total += coefficient * eccentricity_powers[abs(km)] * math.sin(arg)
    total += 3958 * math.sin(math.radians(venus_arg))
    total += 1962 * math.sin(math.radians(mean_longitude - latitude_arg))
    total += 318 * math.sin(math.radians(jupiter_arg))
    return mean_longitude + total / 1e6


def _moon_apparent_longitude(jde: float, nut: Nutation) -> float:
    return _normalize(_moon_geometric_longitude(jde) + nut.delta_psi)


# --------------------------------------------------------------------------------------------
# Sidereal time (Meeus ch. 12) and the Ascendant
# --------------------------------------------------------------------------------------------


def mean_sidereal_time(jd_ut: float) -> float:
    """Mean sidereal time at Greenwich in degrees (Meeus 12.4)."""
    t = _centuries(jd_ut)
    return _normalize(280.46061837 + 360.98564736629 * (jd_ut - J2000) + 0.000387933 * t**2 - t**3 / 38710000.0)


def apparent_sidereal_time(jd_ut: float, nut: Nutation) -> float:
    """Apparent sidereal time at Greenwich in degrees (mean time + equation of the equinoxes)."""
    return _normalize(mean_sidereal_time(jd_ut) + nut.delta_psi * math.cos(math.radians(nut.true_obliquity)))


def _ascendant(local_sidereal_time: float, latitude: float, obliquity: float) -> float:
    ramc = math.radians(local_sidereal_time)
    eps = math.radians(obliquity)
    phi = math.radians(latitude)
    asc = math.degrees(math.atan2(math.cos(ramc), -(math.sin(ramc) * math.cos(eps) + math.tan(phi) * math.sin(eps))))
    # The formula gives one of the two points where the ecliptic meets the horizon. Inside the
    # polar circles it can pick the western one; the Ascendant is by definition the rising (eastern)
    # point, i.e. the one whose hour angle lies in (180, 360) degrees.
    lam = math.radians(asc)
    right_ascension = math.atan2(math.sin(lam) * math.cos(eps), math.cos(lam))
    if math.sin(ramc - right_ascension) > 0:
        asc += 180.0
    return _normalize(asc)


# --------------------------------------------------------------------------------------------
# Public API (docs/ARCHITECTURE.md §4.2)
# --------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class _Instant:
    jd_ut: float
    jde: float
    nutation: Nutation


def _instant(utc: datetime) -> _Instant:
    jd_ut = julian_day(utc)
    jde = jd_ut + delta_t_seconds(_decimal_year(jd_ut)) / SECONDS_PER_DAY
    return _Instant(jd_ut=jd_ut, jde=jde, nutation=nutation(jde))


def _validate_place(latitude: float, longitude: float) -> None:
    if not (math.isfinite(latitude) and -90.0 <= latitude <= 90.0):
        raise ValueError("latitude must be within [-90, 90]")
    if not (math.isfinite(longitude) and -180.0 <= longitude <= 180.0):
        raise ValueError("longitude must be within [-180, 180] (east positive)")


def _ascendant_at(instant: _Instant, latitude: float, longitude: float) -> float:
    local_sidereal = apparent_sidereal_time(instant.jd_ut, instant.nutation) + longitude
    return _ascendant(local_sidereal, latitude, instant.nutation.true_obliquity)


def sun_longitude(utc: datetime) -> float:
    """Apparent geocentric ecliptic longitude of the Sun (true equinox of date), degrees [0, 360)."""
    instant = _instant(utc)
    return _sun_apparent_longitude(instant.jde, instant.nutation)


def moon_longitude(utc: datetime) -> float:
    """Apparent geocentric ecliptic longitude of the Moon (true equinox of date), degrees [0, 360)."""
    instant = _instant(utc)
    return _moon_apparent_longitude(instant.jde, instant.nutation)


def ascendant_longitude(utc: datetime, latitude: float, longitude: float) -> float:
    """Ecliptic longitude of the point rising on the eastern horizon; ``longitude`` east-positive."""
    _validate_place(latitude, longitude)
    return _ascendant_at(_instant(utc), latitude, longitude)


def sign_of(longitude: float) -> WesternSign:
    """Tropical sign containing an ecliptic longitude (any real value, wrapped to [0, 360))."""
    return WESTERN_SIGNS[int(_normalize(longitude) // SIGN_WIDTH)]


def zodiac_point(longitude: float) -> ZodiacPoint:
    """Sign and degree within the sign; rounded to 1e-6 deg (0.004") so stored charts are tidy."""
    if not math.isfinite(longitude):
        raise ValueError("longitude must be finite")
    lon = _normalize(round(_normalize(longitude), 6))
    index = int(lon // SIGN_WIDTH)
    degree = round(lon - index * SIGN_WIDTH, 6)
    return ZodiacPoint(sign=WESTERN_SIGNS[index], longitude=lon, degree_in_sign=degree)


def is_on_cusp(longitude: float, orb: float = CUSP_ORB) -> bool:
    """True when ``longitude`` lies within ``orb`` degrees of a sign boundary."""
    degree = _normalize(longitude) % SIGN_WIDTH
    return degree < orb or degree > SIGN_WIDTH - orb


def compute_western(utc: datetime, latitude: float, longitude: float) -> WesternChart:
    """Sun, Moon and Ascendant for a birth instant and place (east-positive longitude)."""
    _validate_place(latitude, longitude)
    instant = _instant(utc)
    sun = _sun_apparent_longitude(instant.jde, instant.nutation)
    return WesternChart(
        sun=zodiac_point(sun),
        moon=zodiac_point(_moon_apparent_longitude(instant.jde, instant.nutation)),
        ascendant=zodiac_point(_ascendant_at(instant, latitude, longitude)),
        sun_on_cusp=is_on_cusp(sun),
    )


def sun_sign_for_date(d: date) -> tuple[WesternSign, WesternSign | None]:
    """Sun sign for a calendar date without a birth time or place.

    The date lasts from 00:00 at UTC+14 to 24:00 at UTC-12. If the Sun changes sign inside that
    window the result is ``(sign at 12:00 UTC, the other sign)``, otherwise ``(sign, None)``.
    """
    midnight = datetime.combine(d, time(0, 0), tzinfo=UTC)
    first_sign = sign_of(sun_longitude(midnight - _EARLIEST_OFFSET))
    last_sign = sign_of(sun_longitude(midnight + timedelta(days=1) - _LATEST_OFFSET))
    noon_sign = sign_of(sun_longitude(midnight + timedelta(hours=12)))
    if first_sign == last_sign:
        return noon_sign, None
    return noon_sign, (last_sign if noon_sign == first_sign else first_sign)
