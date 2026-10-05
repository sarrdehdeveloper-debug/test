"""Convert a birth wall-clock time at a place into an exact UTC instant.

Historical offsets and daylight-saving rules come from the IANA time-zone database via
``zoneinfo`` (system zoneinfo files, falling back to the pinned ``tzdata`` package), never from
fixed offsets: e.g. Egypt observed DST in 1990 but not in 2015, and re-introduced it in 2023.

Ambiguity is detected per PEP 495: a wall time is interpreted with ``fold=0`` and ``fold=1`` and
each interpretation is round-tripped through UTC. Both round-trip to *different* instants -> the
wall time happened twice (clocks went back); neither round-trips -> the wall time never happened
(clocks jumped forward).
"""

from __future__ import annotations

import zoneinfo
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache

# Present in some zoneinfo directories but not real IANA location names: "localtime" is the
# host's own zone, "posixrules"/"Factory" are build artefacts.
_NON_LOCATION_KEYS = frozenset({"localtime", "posixrules", "Factory"})


@dataclass(frozen=True)
class ResolvedTime:
    local: datetime  # aware, tzinfo=ZoneInfo(tz_name), fold applied
    utc: datetime  # aware UTC
    utc_offset_minutes: int
    is_dst: bool
    fold: int


class AmbiguousLocalTime(Exception):
    """The wall time occurs twice (DST fall-back); the caller must pick a fold."""

    def __init__(self, options: list[ResolvedTime]) -> None:
        super().__init__("ambiguous local time")
        # fold=0 (the earlier instant, usually still DST) first, then fold=1.
        self.options = options


class NonexistentLocalTime(Exception):
    """The wall time was skipped (DST spring-forward or a zone changing its offset)."""

    def __init__(self, suggested: ResolvedTime) -> None:
        super().__init__("nonexistent local time")
        # The instant obtained with the offset in force before the gap, i.e. the wall time
        # shifted forward by the size of the gap (02:30 in a 02:00->03:00 gap -> 03:30).
        self.suggested = suggested


@lru_cache(maxsize=1)
def _known_zone_names() -> frozenset[str]:
    return frozenset(zoneinfo.available_timezones()) - _NON_LOCATION_KEYS


def is_valid_timezone(tz_name: str) -> bool:
    """True when ``tz_name`` is an IANA location key known to this installation."""
    return isinstance(tz_name, str) and tz_name in _known_zone_names()


def get_zone(tz_name: str) -> zoneinfo.ZoneInfo:
    """Return the ``ZoneInfo`` for an IANA name; raise ``ValueError`` for anything else."""
    if not is_valid_timezone(tz_name):
        raise ValueError(f"unknown time zone: {tz_name!r}")
    try:
        return zoneinfo.ZoneInfo(tz_name)
    except (zoneinfo.ZoneInfoNotFoundError, OSError, ValueError) as exc:
        raise ValueError(f"unknown time zone: {tz_name!r}") from exc


def _offset_minutes(offset: timedelta) -> int:
    # Local mean time offsets (before a zone adopted standard time) have seconds,
    # e.g. Asia/Kathmandu +05:41:16 until 1920; the exact instant is kept in ``utc``.
    return round(offset.total_seconds() / 60)


def _from_utc(utc: datetime, zone: zoneinfo.ZoneInfo) -> ResolvedTime:
    local = utc.astimezone(zone)
    offset = local.utcoffset() or timedelta(0)
    dst = local.dst() or timedelta(0)
    return ResolvedTime(
        local=local,
        utc=utc,
        utc_offset_minutes=_offset_minutes(offset),
        # Positive DST component only: Europe/Dublin's winter "negative DST" is standard time.
        is_dst=dst > timedelta(0),
        fold=local.fold,
    )


def resolve_local_time(d: date, t: time, tz_name: str, fold: int | None = None) -> ResolvedTime:
    """Resolve the wall time ``d t`` in ``tz_name`` to an exact instant.

    ``fold=None`` raises :class:`AmbiguousLocalTime` for a repeated wall time; ``fold`` 0/1 picks
    the earlier/later occurrence (ignored when the time is not ambiguous, the result then has
    ``fold=0``). A skipped wall time always raises :class:`NonexistentLocalTime`.
    Raises ``ValueError`` for an unknown zone, an aware ``t`` or a fold other than None/0/1.
    """
    if fold is not None and (not isinstance(fold, int) or fold not in (0, 1)):
        raise ValueError("fold must be None, 0 or 1")
    if t.tzinfo is not None:
        raise ValueError("t must be a naive wall-clock time")
    zone = get_zone(tz_name)
    wall = datetime.combine(d, t)

    candidates: list[ResolvedTime] = []
    for f in (0, 1):
        utc = wall.replace(tzinfo=zone, fold=f).astimezone(UTC)
        resolved = _from_utc(utc, zone)
        if resolved.local.replace(tzinfo=None) == wall:
            candidates.append(resolved)

    if not candidates:
        utc_before_gap = wall.replace(tzinfo=zone, fold=0).astimezone(UTC)
        raise NonexistentLocalTime(_from_utc(utc_before_gap, zone))
    if len(candidates) == 1 or candidates[0].utc == candidates[1].utc:
        return candidates[0]

    options = sorted(candidates, key=lambda r: r.utc)
    if fold is None:
        raise AmbiguousLocalTime(options)
    return options[fold]
