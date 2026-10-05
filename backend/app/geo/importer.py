"""Load countries and cities into the ``countries`` / ``cities`` tables.

Data source: GeoNames (https://www.geonames.org), bundled by the ``geonamescache`` package.
GeoNames data is licensed under Creative Commons Attribution 4.0 (CC BY 4.0,
https://creativecommons.org/licenses/by/4.0/): the site must credit "GeoNames" wherever place
data is shown (e.g. footer or credits page). Localised country names come from the Unicode CLDR
via Babel (Unicode License).

Run with ``python -m app.cli import-geo [--min-population N]``. The import is idempotent: rows
are upserted, and cities that disappeared from the data set are deleted unless an order still
references them.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Container, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, TypeVar
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from babel import Locale, UnknownLocaleError
from geonamescache import GeonamesCache
from sqlalchemy import Table, delete, exists, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import session_scope
from app.geo.normalize import SEARCH_SEPARATOR, fold
from app.models import City, Country, Order

logger = logging.getLogger(__name__)

# City population thresholds geonamescache ships data files for.
SUPPORTED_MIN_POPULATIONS: tuple[int, ...] = (500, 1000, 5000, 15000)

_BATCH_SIZE = 5000
_MAX_NAME_LENGTH = 200  # matches the String(200) columns

RawRecord = Mapping[str, Any]
T = TypeVar("T")


@dataclass(frozen=True)
class GeoDataset:
    """Rows ready to be written: dicts keyed by column name."""

    countries: list[dict[str, Any]]
    cities: list[dict[str, Any]]


def import_geo(min_population: int = 15000) -> dict[str, int]:
    """Import GeoNames countries and cities with at least ``min_population`` inhabitants.

    Returns counts: ``countries``, ``cities``, ``capitals``, ``deleted_cities`` and
    ``retained_cities`` (stale cities kept because orders reference them).
    """
    if min_population not in SUPPORTED_MIN_POPULATIONS:
        allowed = ", ".join(str(value) for value in SUPPORTED_MIN_POPULATIONS)
        raise ValueError(f"min_population must be one of {allowed}, got {min_population}")

    cache = GeonamesCache(min_city_population=min_population)
    dataset = build_dataset(
        cache.get_countries(),
        cache.get_cities(),
        {code: state["name"] for code, state in cache.get_us_states().items()},
        get_settings().locales,
    )
    with session_scope() as db:
        counts = write_dataset(db, dataset)
    logger.info("Geo import finished (min_population=%d): %s", min_population, counts)
    return counts


# ---------------------------------------------------------------------------
# Transformation (pure, no database)
# ---------------------------------------------------------------------------


def build_dataset(
    raw_countries: Mapping[str, RawRecord],
    raw_cities: Mapping[str, RawRecord],
    us_state_names: Mapping[str, str],
    locales: Sequence[str],
) -> GeoDataset:
    """Turn geonamescache records into table rows (validated, with capitals and time zones)."""
    cities = [
        row for raw in raw_cities.values() if (row := _city_row(raw, raw_countries.keys(), us_state_names)) is not None
    ]
    cities_by_country: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for city in cities:
        cities_by_country[city["country_code"]].append(city)

    territory_names = _territory_names(locales)
    countries = []
    for code, raw in raw_countries.items():
        country_cities = cities_by_country.get(code, [])
        capital = (raw.get("capital") or "").strip() or None
        if capital:
            _mark_capital(country_cities, capital)
        countries.append(
            {
                "code": code,
                "name": _clip(raw["name"]),
                "names": {locale: _clip(names.get(code) or raw["name"]) for locale, names in territory_names.items()},
                "capital": _clip(capital) if capital else None,
                "timezones": _timezones_by_population(country_cities),
            }
        )
    return GeoDataset(countries=countries, cities=cities)


def _city_row(
    raw: RawRecord, country_codes: Container[str], us_state_names: Mapping[str, str]
) -> dict[str, Any] | None:
    country_code = raw.get("countrycode")
    name = (raw.get("name") or "").strip()
    timezone = (raw.get("timezone") or "").strip()
    if country_code not in country_codes or not name or not is_valid_timezone(timezone):
        return None
    try:
        city_id = int(raw["geonameid"])
        latitude = float(raw["latitude"])
        longitude = float(raw["longitude"])
        population = max(int(raw.get("population") or 0), 0)
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None
    admin1 = us_state_names.get(raw.get("admin1code") or "") if country_code == "US" else None
    return {
        "id": city_id,
        "country_code": country_code,
        "name": _clip(name),
        "ascii_name": _clip(fold(name)),
        "search_text": build_search_text(name, raw.get("alternatenames") or ()),
        # GeoNames alternate names are not language-tagged in this data set, so no reliable
        # per-locale city names exist; the API falls back to ``name``.
        "names": {},
        "admin1": admin1,
        "latitude": latitude,
        "longitude": longitude,
        "timezone": timezone,
        "population": population,
        "is_capital": False,
    }


def build_search_text(name: str, alternate_names: Iterable[str]) -> str:
    """``|``-joined, de-duplicated lower-cased and folded spellings, e.g. ``cairo|...|القاهرة|القاهره``."""
    tokens: dict[str, None] = {}  # insertion-ordered set
    for spelling in (name, *alternate_names):
        for token in (spelling.lower().strip(), fold(spelling)):
            token = token.replace(SEARCH_SEPARATOR, " ").strip()
            if token:
                tokens[token] = None
    return SEARCH_SEPARATOR.join(tokens)


def _mark_capital(cities: list[dict[str, Any]], capital: str) -> None:
    """Flag the most populous city matching the capital's name (exactly one per country).

    GeoNames spells some capitals differently in the country table and the city table
    ("Bogota" vs "Bogotá", "St. John's" vs "Saint John’s", "Nur-Sultan" vs "Astana"), so
    progressively looser matches are tried: exact name, folded name, folded alternate name.
    """
    wanted = _capital_key(capital)
    tiers = (
        lambda city: city["name"] == capital,
        lambda city: _capital_key(city["name"]) == wanted,
        lambda city: wanted in {_capital_key(token) for token in city["search_text"].split(SEARCH_SEPARATOR)},
    )
    for matches in tiers:
        candidates = [city for city in cities if matches(city)]
        if candidates:
            max(candidates, key=lambda city: (city["population"], -city["id"]))["is_capital"] = True
            return


def _capital_key(value: str) -> str:
    key = " ".join(fold(value).replace("-", " ").replace(".", " ").split())
    if key.startswith("st "):
        key = "saint " + key[3:]
    return key


def _timezones_by_population(cities: Iterable[dict[str, Any]]) -> list[str]:
    """Distinct IANA zones, the zone with the largest city population first."""
    population_by_zone: dict[str, int] = defaultdict(int)
    for city in cities:
        population_by_zone[city["timezone"]] += city["population"]
    return sorted(population_by_zone, key=lambda zone: (-population_by_zone[zone], zone))


def _territory_names(locales: Sequence[str]) -> dict[str, Mapping[str, str]]:
    names: dict[str, Mapping[str, str]] = {}
    for locale in locales:
        try:
            names[locale] = Locale.parse(locale).territories
        except (UnknownLocaleError, ValueError):
            logger.warning("No CLDR data for locale %r; country names fall back to English", locale)
            names[locale] = {}
    return names


@lru_cache(maxsize=1024)
def is_valid_timezone(name: str) -> bool:
    if not name:
        return False
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def _clip(value: str) -> str:
    return value.strip()[:_MAX_NAME_LENGTH]


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def write_dataset(db: Session, dataset: GeoDataset) -> dict[str, int]:
    """Upsert countries and cities, then remove stale cities. The caller commits."""
    _upsert(db, Country.__table__, "code", dataset.countries)
    _upsert(db, City.__table__, "id", dataset.cities)
    deleted, retained = _remove_stale_cities(db, {city["id"] for city in dataset.cities})
    return {
        "countries": len(dataset.countries),
        "cities": len(dataset.cities),
        "capitals": sum(1 for city in dataset.cities if city["is_capital"]),
        "deleted_cities": deleted,
        "retained_cities": retained,
    }


def _upsert(db: Session, table: Table, key: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    stmt = pg_insert(table)
    columns = [column.name for column in table.columns if column.name != key]
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c[key]],
        set_={name: stmt.excluded[name] for name in columns},
        # Skip unchanged rows so periodic re-imports do not rewrite (and bloat) the whole table.
        where=tuple_(*(table.c[name] for name in columns)).is_distinct_from(
            tuple_(*(stmt.excluded[name] for name in columns))
        ),
    )
    for batch in _chunks(rows, _BATCH_SIZE):
        db.execute(stmt, batch)


def _remove_stale_cities(db: Session, keep_ids: set[int]) -> tuple[int, int]:
    """Delete cities missing from the new data set; keep those orders still reference.

    Kept cities lose their capital flag so each country keeps exactly one capital.
    """
    stale_ids = sorted(set(db.scalars(select(City.id))) - keep_ids)
    deleted = 0
    for chunk in _chunks(stale_ids, _BATCH_SIZE):
        db.execute(
            update(City).where(City.id.in_(chunk)).values(is_capital=False).execution_options(synchronize_session=False)
        )
        result = db.execute(
            delete(City)
            .where(City.id.in_(chunk), ~exists().where(Order.city_id == City.id))
            .execution_options(synchronize_session=False)
        )
        deleted += result.rowcount
    return deleted, len(stale_ids) - deleted


def _chunks(items: Sequence[T], size: int) -> Iterator[Sequence[T]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]
