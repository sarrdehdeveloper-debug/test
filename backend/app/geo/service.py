"""Country listing and city search over the imported GeoNames data."""

from __future__ import annotations

from sqlalchemy import ColumnElement, Select, case, exists, literal, or_, select
from sqlalchemy.orm import Session

from app.errors import not_found
from app.geo.normalize import SEARCH_SEPARATOR, clean_query, fold
from app.geo.schemas import CityOut, CountryOut
from app.models import City, Country

# Countries whose labels carry the first-level division: US city names repeat across states
# ("Springfield"), and GeoNames gives readable admin1 names only for US states.
_LABEL_WITH_ADMIN1 = frozenset({"US"})
_LABEL_SEPARATORS = {"ar": "، "}  # Arabic comma
_DEFAULT_LABEL_SEPARATOR = ", "


def localized_country_name(country: Country, locale: str) -> str:
    return (country.names or {}).get(locale) or country.name


def localized_city_name(city: City, locale: str) -> str:
    return (city.names or {}).get(locale) or city.name


def city_label(city: City, country: Country, locale: str) -> str:
    """Human label, e.g. ``"Cairo, Egypt"`` or ``"Austin, Texas, United States"`` (localised country)."""
    parts = [localized_city_name(city, locale)]
    if city.admin1 and city.country_code in _LABEL_WITH_ADMIN1:
        parts.append(city.admin1)
    parts.append(localized_country_name(country, locale))
    return _LABEL_SEPARATORS.get(locale, _DEFAULT_LABEL_SEPARATOR).join(parts)


def city_out(city: City, country: Country, locale: str) -> CityOut:
    return CityOut(
        id=city.id,
        name=localized_city_name(city, locale),
        admin1=city.admin1,
        country_code=city.country_code,
        timezone=city.timezone,
        latitude=city.latitude,
        longitude=city.longitude,
        population=city.population,
        is_capital=city.is_capital,
        label=city_label(city, country, locale),
    )


def get_city_out(db: Session, city_id: int, locale: str) -> CityOut | None:
    """Public representation of one city (``None`` if unknown), e.g. for order place labels."""
    row = db.execute(select(City, Country).join(Country, Country.code == City.country_code).where(City.id == city_id))
    found = row.first()
    return city_out(found[0], found[1], locale) if found else None


def list_countries(db: Session, locale: str) -> list[CountryOut]:
    """Countries that have at least one city, sorted by localised name."""
    countries = db.scalars(select(Country).where(exists().where(City.country_code == Country.code))).all()
    capitals = _capital_ids(db)
    items = [
        CountryOut(
            code=country.code,
            name=localized_country_name(country, locale),
            name_en=country.name,
            timezones=list(country.timezones or []),
            capital_city_id=capitals.get(country.code),
        )
        for country in countries
    ]
    # Folding makes accented names sort with their base letter ("Åland" with "A", "Türkiye" with "T")
    # and Arabic hamza/alef variants together, which is close enough to locale collation here.
    items.sort(key=lambda item: (fold(item.name), item.name, item.code))
    return items


def _capital_ids(db: Session) -> dict[str, int]:
    """``{country_code: capital city id}``. One pass over the capitals is far cheaper than a
    per-country subquery; the importer keeps one capital per country, population breaks ties."""
    rows = db.execute(
        select(City.country_code, City.id).where(City.is_capital).order_by(City.population.desc(), City.id)
    )
    capitals: dict[str, int] = {}
    for country_code, city_id in rows:
        capitals.setdefault(country_code, city_id)
    return capitals


def search_cities(db: Session, country_code: str, query: str | None, limit: int, locale: str) -> list[CityOut]:
    """Cities of ``country_code`` matching ``query``; raises ``not_found`` for an unknown country.

    Ranking: exact name match, then prefix match, then substring match; population breaks ties.
    Without a query: the capital first, then the most populous cities.
    """
    country = db.get(Country, country_code)
    if country is None:
        raise not_found("country")

    stmt = select(City).where(City.country_code == country.code)
    cleaned = clean_query((query or "").replace(SEARCH_SEPARATOR, " "))
    if cleaned:
        stmt = _apply_text_search(stmt, cleaned)
    else:
        stmt = stmt.order_by(City.is_capital.desc(), City.population.desc(), City.name, City.id)
    cities = db.scalars(stmt.limit(limit)).all()
    return [city_out(city, country, locale) for city in cities]


def _apply_text_search(stmt: Select[tuple[City]], query: str) -> Select[tuple[City]]:
    folded = fold(query)
    # Ordered de-duplication keeps the generated SQL stable, so SQLAlchemy's statement cache hits.
    spellings = list(dict.fromkeys(spelling for spelling in (query.lower(), folded) if spelling))
    # Wrapping the "|"-joined spellings in separators turns "token equals" / "token starts with"
    # into plain LIKE patterns, so alternate names ("القاهرة", "Kairo") rank like the main name.
    tokens = literal(SEARCH_SEPARATOR) + City.search_text + literal(SEARCH_SEPARATOR)

    exact: list[ColumnElement[bool]] = [
        tokens.contains(f"{SEARCH_SEPARATOR}{s}{SEARCH_SEPARATOR}", autoescape=True) for s in spellings
    ]
    prefix: list[ColumnElement[bool]] = [tokens.contains(f"{SEARCH_SEPARATOR}{s}", autoescape=True) for s in spellings]
    substring: list[ColumnElement[bool]] = [City.search_text.contains(s, autoescape=True) for s in spellings]
    if folded:
        exact.append(City.ascii_name == folded)
        prefix.append(City.ascii_name.startswith(folded, autoescape=True))
        substring.append(City.ascii_name.contains(folded, autoescape=True))

    rank = case((or_(*exact), 0), (or_(*prefix), 1), else_=2)
    return stmt.where(or_(*prefix, *substring)).order_by(rank, City.population.desc(), City.name, City.id)
