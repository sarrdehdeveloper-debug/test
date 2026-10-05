"""Geo module: text folding, importer (pure transformation, persistence, full GeoNames import) and API."""

from __future__ import annotations

import time
import uuid

import pytest
from sqlalchemy import func, select

from app.geo import importer
from app.geo.importer import GeoDataset, build_dataset, build_search_text, import_geo, write_dataset
from app.geo.normalize import clean_query, fold
from app.models import City, Country, Order

COUNTRIES_URL = "/api/v1/geo/countries"
CITIES_URL = "/api/v1/geo/cities"


def add_city(
    db,
    *,
    city_id: int,
    country: str,
    name: str,
    population: int,
    alternate_names: tuple[str, ...] = (),
    admin1: str | None = None,
    is_capital: bool = False,
    timezone: str = "UTC",
    names: dict | None = None,
) -> None:
    db.add(
        City(
            id=city_id,
            country_code=country,
            name=name,
            ascii_name=fold(name),
            search_text=build_search_text(name, alternate_names),
            names=names or {},
            admin1=admin1,
            latitude=10.0,
            longitude=20.0,
            timezone=timezone,
            population=population,
            is_capital=is_capital,
        )
    )
    db.commit()


def cities(client, **params) -> list[dict]:
    response = client.get(CITIES_URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def field_errors(response) -> list[str]:
    assert response.status_code == 422, response.text
    body = response.json()["error"]
    assert body["code"] == "validation_error"
    return [field["field"] for field in body["details"]["fields"]]


# ---------------------------------------------------------------------------
# Text folding
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "folded"),
    [
        ("Zürich", "zurich"),
        ("Łódź", "lodz"),
        ("São Paulo", "sao paulo"),
        ("Reykjavík", "reykjavik"),
        ("Straße", "strasse"),
        ("Saint John’s", "saint john's"),
        ("  CAIRO ", "cairo"),
        ("الإسكندرية", "الاسكندريه"),  # hamza seat + ta marbuta unified
        ("القَاهِرَة", "القاهره"),  # tashkeel removed
        ("أبوظبي", "ابوظبي"),
        ("سيدي بوزيد", "سيدي بوزيد"),
        ("서울", "서울"),  # Hangul survives the NFKD round trip
    ],
)
def test_fold(raw, folded):
    assert fold(raw) == folded


def test_clean_query_strips_control_and_format_characters():
    assert clean_query("  cai\x00ro \t\n city ") == "cai ro city"
    assert clean_query("‏القاهرة‎") == "القاهرة"
    assert clean_query("\x00\x01") == ""


def test_build_search_text_dedupes_and_contains_all_spellings():
    text = build_search_text("Cairo", ["Kairo", "CAIRO", "القاهرة", "a|b"])
    tokens = text.split("|")
    assert tokens[0] == "cairo"
    assert tokens.count("cairo") == 1
    assert "kairo" in tokens
    assert "القاهرة" in tokens and "القاهره" in tokens  # raw and folded Arabic spelling
    assert "a b" in tokens  # the separator never leaks out of a token


# ---------------------------------------------------------------------------
# Importer: pure transformation
# ---------------------------------------------------------------------------


def _raw_city(geonameid: int, name: str, country: str, population: int, tz: str, **extra) -> dict:
    return {
        "geonameid": geonameid,
        "name": name,
        "latitude": 1.5,
        "longitude": 2.5,
        "countrycode": country,
        "population": population,
        "timezone": tz,
        "admin1code": extra.pop("admin1code", "01"),
        "alternatenames": extra.pop("alternatenames", []),
        **extra,
    }


RAW_COUNTRIES = {
    "EG": {"name": "Egypt", "capital": "Cairo"},
    "CO": {"name": "Colombia", "capital": "Bogota"},
    "US": {"name": "United States", "capital": "Washington"},
    "KZ": {"name": "Kazakhstan", "capital": "Nur-Sultan"},
    "AQ": {"name": "Antarctica", "capital": ""},
}


def _raw_cities() -> dict[str, dict]:
    rows: list[dict] = [
        _raw_city(1, "Cairo", "EG", 9_000_000, "Africa/Cairo", alternatenames=["القاهرة", "Kairo"]),
        _raw_city(2, "Alexandria", "EG", 4_000_000, "Africa/Cairo"),
        _raw_city(3, "Bogotá", "CO", 7_000_000, "America/Bogota"),
        _raw_city(4, "Washington", "US", 700_000, "America/New_York", admin1code="DC"),
        _raw_city(5, "Washington", "US", 20_000, "America/New_York", admin1code="PA"),
        _raw_city(6, "Los Angeles", "US", 3_900_000, "America/Los_Angeles", admin1code="CA"),
        _raw_city(7, "New York City", "US", 8_800_000, "America/New_York", admin1code="NY"),
        _raw_city(8, "Chicago", "US", 2_700_000, "America/Chicago", admin1code="IL"),
        _raw_city(9, "Astana", "KZ", 1_500_000, "Asia/Almaty", alternatenames=["Nur-Sultan", "Akmola"]),
        _raw_city(10, "Atlantis", "XX", 1_000, "UTC"),  # unknown country
        _raw_city(11, "Nowhere", "EG", 1_000, "Mars/Olympus_Mons"),  # invalid time zone
        _raw_city(12, "Blank zone", "EG", 1_000, ""),
        _raw_city(13, "Bad latitude", "EG", 1_000, "Africa/Cairo", latitude=95.0),
        _raw_city(14, "Bad longitude", "EG", 1_000, "Africa/Cairo", longitude="east"),
        _raw_city(16, "Bad population", "EG", "many", "Africa/Cairo"),  # type: ignore[arg-type]
    ]
    by_id = {str(row["geonameid"]): row for row in rows}
    by_id["17"] = {"name": "No id", "countrycode": "EG", "timezone": "Africa/Cairo", "latitude": 1, "longitude": 1}
    return by_id


US_STATES = {"DC": "District of Columbia", "PA": "Pennsylvania", "CA": "California", "NY": "New York", "IL": "Illinois"}


@pytest.fixture
def dataset() -> GeoDataset:
    return build_dataset(RAW_COUNTRIES, _raw_cities(), US_STATES, ["en", "ar"])


def test_build_dataset_skips_invalid_cities(dataset):
    assert sorted(city["id"] for city in dataset.cities) == [1, 2, 3, 4, 5, 6, 7, 8, 9]


def test_build_dataset_city_columns(dataset):
    cairo = next(city for city in dataset.cities if city["id"] == 1)
    assert cairo["name"] == "Cairo"
    assert cairo["ascii_name"] == "cairo"
    assert cairo["names"] == {}
    assert cairo["admin1"] is None  # only US states have readable admin1 names
    assert "القاهرة" in cairo["search_text"].split("|")
    assert (cairo["latitude"], cairo["longitude"], cairo["timezone"]) == (1.5, 2.5, "Africa/Cairo")

    bogota = next(city for city in dataset.cities if city["id"] == 3)
    assert bogota["ascii_name"] == "bogota"

    admin1 = {city["id"]: city["admin1"] for city in dataset.cities if city["country_code"] == "US"}
    assert admin1 == {4: "District of Columbia", 5: "Pennsylvania", 6: "California", 7: "New York", 8: "Illinois"}


def test_build_dataset_marks_exactly_one_capital_per_country(dataset):
    capitals = {city["country_code"]: city["id"] for city in dataset.cities if city["is_capital"]}
    # Cairo: exact; Bogotá: folded spelling; Washington DC: most populous of two exact matches;
    # Astana: matched through the alternate name "Nur-Sultan".
    assert capitals == {"EG": 1, "CO": 3, "US": 4, "KZ": 9}
    assert sum(city["is_capital"] for city in dataset.cities) == 4


def test_build_dataset_country_rows(dataset):
    countries = {country["code"]: country for country in dataset.countries}
    assert set(countries) == set(RAW_COUNTRIES)
    egypt = countries["EG"]
    assert egypt["name"] == "Egypt"
    assert egypt["names"] == {"en": "Egypt", "ar": "مصر"}
    assert egypt["capital"] == "Cairo"
    assert egypt["timezones"] == ["Africa/Cairo"]
    # Zones ordered by the population living in them, most populous first.
    assert countries["US"]["timezones"] == ["America/New_York", "America/Los_Angeles", "America/Chicago"]
    assert countries["AQ"]["capital"] is None
    assert countries["AQ"]["timezones"] == []


def test_build_dataset_unknown_locale_falls_back_to_english():
    data = build_dataset({"EG": {"name": "Egypt", "capital": "Cairo"}}, {}, {}, ["en", "zz-unknown"])
    assert data.countries[0]["names"] == {"en": "Egypt", "zz-unknown": "Egypt"}


def test_import_geo_rejects_unsupported_population():
    with pytest.raises(ValueError, match="min_population"):
        import_geo(min_population=12345)


# ---------------------------------------------------------------------------
# Importer: persistence
# ---------------------------------------------------------------------------


def _make_order(db, city_id: int) -> Order:
    order = Order(
        email="buyer@example.com",
        locale="en",
        city_id=city_id,
        calc_version="test",
        list_price_cents=2900,
        amount_cents=2900,
        currency="USD",
        payment_provider="fake",
        access_token_hash=uuid.uuid4().hex,
    )
    db.add(order)
    db.commit()
    return order


def _db_cities(db) -> dict[int, City]:
    db.expire_all()
    return {city.id: city for city in db.scalars(select(City))}


def test_write_dataset_inserts_and_is_idempotent(db, dataset):
    counts = write_dataset(db, dataset)
    db.commit()
    assert counts == {"countries": 5, "cities": 9, "capitals": 4, "deleted_cities": 0, "retained_cities": 0}

    again = write_dataset(db, build_dataset(RAW_COUNTRIES, _raw_cities(), US_STATES, ["en", "ar"]))
    db.commit()
    assert again == counts
    assert db.scalar(select(func.count()).select_from(City)) == 9
    assert db.scalar(select(func.count()).select_from(Country)) == 5
    egypt = db.get(Country, "EG")
    assert egypt.names["ar"] == "مصر"


def test_write_dataset_updates_changed_rows(db, dataset):
    write_dataset(db, dataset)
    db.commit()
    raw = _raw_cities()
    raw["2"]["population"] = 5_000_000
    raw["2"]["name"] = "Al Iskandariyah"
    write_dataset(db, build_dataset(RAW_COUNTRIES, raw, US_STATES, ["en", "ar"]))
    db.commit()
    alexandria = _db_cities(db)[2]
    assert (alexandria.name, alexandria.ascii_name, alexandria.population) == (
        "Al Iskandariyah",
        "al iskandariyah",
        5_000_000,
    )


def test_write_dataset_removes_stale_cities_but_keeps_ordered_ones(db, dataset):
    write_dataset(db, dataset)
    db.commit()
    order = _make_order(db, city_id=1)  # an order was placed for Cairo

    raw = _raw_cities()
    del raw["1"]  # Cairo and Alexandria disappear from the source data
    del raw["2"]
    raw["15"] = _raw_city(15, "Cairo", "EG", 100, "Africa/Cairo")  # a new, smaller "Cairo" becomes capital
    counts = write_dataset(db, build_dataset(RAW_COUNTRIES, raw, US_STATES, ["en", "ar"]))
    db.commit()

    assert counts["deleted_cities"] == 1
    assert counts["retained_cities"] == 1
    stored = _db_cities(db)
    assert 2 not in stored
    assert 1 in stored and stored[1].is_capital is False  # kept for the order, no longer a capital
    assert stored[15].is_capital is True
    capitals_eg = [city.id for city in stored.values() if city.country_code == "EG" and city.is_capital]
    assert capitals_eg == [15]
    db.expire_all()
    assert db.get(Order, order.id).city_id == 1


# ---------------------------------------------------------------------------
# Full GeoNames import (real data, min population 15000)
# ---------------------------------------------------------------------------


def test_full_import_and_search(db, client):
    started = time.monotonic()
    first = import_geo(min_population=15000)
    assert time.monotonic() - started < 60

    assert first["countries"] > 240
    assert first["cities"] > 30000
    assert first["capitals"] > 230

    cairo = db.get(City, 360630)
    assert cairo is not None
    assert (cairo.name, cairo.timezone, cairo.is_capital) == ("Cairo", "Africa/Cairo", True)
    assert "القاهرة" in cairo.search_text.split("|")
    egypt = db.get(Country, "EG")
    assert egypt.names["ar"] == "مصر"
    assert egypt.capital == "Cairo"
    assert egypt.timezones == ["Africa/Cairo"]
    us = db.get(Country, "US")
    assert len(us.timezones) >= 4
    assert us.timezones[0] == "America/New_York"
    washington = db.get(City, 4140963)
    assert washington.is_capital and washington.admin1 == "District of Columbia"

    duplicated_capitals = db.execute(
        select(City.country_code).where(City.is_capital).group_by(City.country_code).having(func.count() > 1)
    ).all()
    assert duplicated_capitals == []

    second = import_geo(min_population=15000)
    assert second == {**first, "deleted_cities": 0, "retained_cities": 0}
    assert db.scalar(select(func.count()).select_from(City)) == first["cities"]
    assert db.scalar(select(func.count()).select_from(Country)) == first["countries"]

    # The API on real data: Arabic and Latin queries both find Cairo first.
    assert cities(client, country="EG", q="القاهرة")[0]["id"] == 360630
    assert cities(client, country="EG", q="cair")[0]["id"] == 360630
    assert cities(client, country="EG", q="Kairo")[0]["id"] == 360630
    assert cities(client, country="EG")[0]["id"] == 360630
    austin = cities(client, country="US", q="Austin")[0]
    assert austin["label"] == "Austin, Texas, United States"
    countries = client.get(COUNTRIES_URL, params={"locale": "ar"}).json()["items"]
    egypt_out = next(item for item in countries if item["code"] == "EG")
    assert egypt_out == {
        "code": "EG",
        "name": "مصر",
        "name_en": "Egypt",
        "timezones": ["Africa/Cairo"],
        "capital_city_id": 360630,
    }
    assert "AQ" not in {item["code"] for item in countries}  # no cities -> not selectable


# ---------------------------------------------------------------------------
# GET /geo/countries
# ---------------------------------------------------------------------------


def test_countries_english(client, sample_geo):
    response = client.get(COUNTRIES_URL, params={"locale": "en"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=86400"
    items = response.json()["items"]
    assert [item["code"] for item in items] == ["EG", "GB", "US"]
    assert items[0] == {
        "code": "EG",
        "name": "Egypt",  # sample rows have no "en" name -> English fallback
        "name_en": "Egypt",
        "timezones": ["Africa/Cairo"],
        "capital_city_id": 360630,
    }
    capitals = {item["code"]: item["capital_city_id"] for item in items}
    assert capitals == {"EG": 360630, "GB": 2643743, "US": None}


def test_countries_arabic_sorted_by_localized_name(client, sample_geo):
    items = client.get(COUNTRIES_URL, params={"locale": "ar-EG"}).json()["items"]
    assert [item["name"] for item in items] == ["المملكة المتحدة", "الولايات المتحدة", "مصر"]
    assert [item["name_en"] for item in items] == ["United Kingdom", "United States", "Egypt"]


def test_countries_default_locale_and_unknown_locale(client, sample_geo):
    default = client.get(COUNTRIES_URL).json()
    assert client.get(COUNTRIES_URL, params={"locale": "fr-FR"}).json() == default
    assert default["items"][0]["name"] == "Egypt"


def test_countries_sort_ignores_accents(client, db, sample_geo):
    db.add_all(
        [
            Country(code="AX", name="Åland Islands", names={}, timezones=["Europe/Mariehamn"]),
            Country(code="BE", name="Belgium", names={}, timezones=["Europe/Brussels"]),
        ]
    )
    db.commit()
    add_city(db, city_id=1, country="AX", name="Mariehamn", population=11_000, timezone="Europe/Mariehamn")
    add_city(db, city_id=2, country="BE", name="Brussels", population=1_000_000, timezone="Europe/Brussels")
    codes = [item["code"] for item in client.get(COUNTRIES_URL).json()["items"]]
    assert codes == ["AX", "BE", "EG", "GB", "US"]


def test_countries_without_cities_are_hidden(client, db, sample_geo):
    db.add(Country(code="AQ", name="Antarctica", names={}, timezones=[]))
    db.commit()
    codes = {item["code"] for item in client.get(COUNTRIES_URL).json()["items"]}
    assert "AQ" not in codes


def test_countries_empty_database(client):
    response = client.get(COUNTRIES_URL)
    assert response.status_code == 200
    assert response.json() == {"items": []}


# ---------------------------------------------------------------------------
# GET /geo/cities
# ---------------------------------------------------------------------------


def test_cities_without_query_most_populous_first(client, sample_geo):
    response = client.get(CITIES_URL, params={"country": "US"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=86400"
    items = response.json()["items"]
    assert [item["name"] for item in items] == ["New York City", "Los Angeles"]


def test_cities_without_query_capital_first(client, db, sample_geo):
    add_city(db, city_id=4140963, country="US", name="Washington", population=689_545, is_capital=True)
    names = [item["name"] for item in cities(client, country="US")]
    assert names == ["Washington", "New York City", "Los Angeles"]


def test_city_shape_and_label(client, sample_geo):
    [cairo, alexandria] = cities(client, country="EG", locale="en")
    assert cairo == {
        "id": 360630,
        "name": "Cairo",
        "admin1": None,
        "country_code": "EG",
        "timezone": "Africa/Cairo",
        "latitude": 30.06263,
        "longitude": 31.24967,
        "population": 9606916,
        "is_capital": True,
        "label": "Cairo, Egypt",
    }
    assert alexandria["label"] == "Alexandria, Egypt"
    assert alexandria["is_capital"] is False


def test_city_label_localized(client, sample_geo):
    [cairo, alexandria] = cities(client, country="EG", locale="ar")
    assert cairo["name"] == "القاهرة"  # localised city name when one is stored
    assert cairo["label"] == "القاهرة، مصر"
    assert alexandria["label"] == "Alexandria، مصر"


def test_us_label_includes_state(client, db, sample_geo):
    add_city(db, city_id=4671654, country="US", name="Austin", population=961_855, admin1="Texas")
    [austin] = cities(client, country="US", q="austin")
    assert austin["admin1"] == "Texas"
    assert austin["label"] == "Austin, Texas, United States"
    [austin_ar] = cities(client, country="US", q="austin", locale="ar")
    assert austin_ar["label"] == "Austin، Texas، الولايات المتحدة"


def test_admin1_not_in_label_outside_us(client, db, sample_geo):
    add_city(db, city_id=360995, country="EG", name="Giza", population=4_000_000, admin1="Giza Governorate")
    [giza] = cities(client, country="EG", q="giza")
    assert giza["admin1"] == "Giza Governorate"
    assert giza["label"] == "Giza, Egypt"


def test_lowercase_and_padded_country_code_is_accepted(client, sample_geo):
    assert [item["id"] for item in cities(client, country=" eg ")] == [360630, 361058]


@pytest.fixture
def springfields(db, sample_geo) -> None:
    add_city(db, city_id=101, country="US", name="Springfield", population=100)
    add_city(db, city_id=102, country="US", name="Springfield Gardens", population=5_000)
    add_city(db, city_id=103, country="US", name="West Springfield", population=900_000)
    add_city(db, city_id=104, country="US", name="Spring", population=50)
    add_city(db, city_id=105, country="US", name="Boston", population=650_000)


def test_ranking_exact_then_prefix_then_substring(client, springfields):
    names = [item["name"] for item in cities(client, country="US", q="springfield")]
    assert names == ["Springfield", "Springfield Gardens", "West Springfield"]


def test_ranking_prefix_matches_by_population(client, springfields):
    names = [item["name"] for item in cities(client, country="US", q="SPRING")]
    # "Spring" is an exact match; prefix matches follow by population; the substring match comes last.
    assert names == ["Spring", "Springfield Gardens", "Springfield", "West Springfield"]


def test_search_is_scoped_to_country(client, springfields):
    assert cities(client, country="EG", q="spring") == []
    assert [item["id"] for item in cities(client, country="GB", q="lon")] == [2643743]


def test_search_trims_query_and_blank_query_lists_cities(client, springfields):
    assert [item["name"] for item in cities(client, country="US", q="  boston  ")] == ["Boston"]
    blank = cities(client, country="US", q="   ")
    assert blank == cities(client, country="US")


def test_search_by_accented_and_unaccented_spelling(client, db, sample_geo):
    db.add(Country(code="CH", name="Switzerland", names={"ar": "سويسرا"}, timezones=["Europe/Zurich"]))
    db.commit()
    add_city(db, city_id=2657896, country="CH", name="Zürich", population=341_730, alternate_names=("Zurigo",))
    for query in ("zurich", "Zürich", "ZÜR", "zurigo", "rich"):
        assert [item["id"] for item in cities(client, country="CH", q=query)] == [2657896], query
    assert cities(client, country="CH", q="zur")[0]["name"] == "Zürich"


@pytest.fixture
def arabic_names(db, sample_geo) -> None:
    cairo = db.get(City, 360630)
    cairo.search_text = build_search_text("Cairo", ["القاهرة", "Kairo", "Le Caire"])
    db.commit()
    add_city(db, city_id=360995, country="EG", name="Giza", population=4_367_343, alternate_names=("الجيزة", "Gizeh"))
    add_city(db, city_id=350203, country="EG", name="Al Qanatir al Khayriyah", population=50_000)


def test_arabic_search(client, arabic_names):
    assert [item["id"] for item in cities(client, country="EG", q="القاهرة")] == [360630]
    assert [item["id"] for item in cities(client, country="EG", q="الجيزة")] == [360995]


def test_arabic_search_tolerates_spelling_variants(client, arabic_names):
    # ta marbuta typed as ha, tashkeel, partial words and tatweel all still match.
    assert [item["id"] for item in cities(client, country="EG", q="الجيزه")] == [360995]
    assert [item["id"] for item in cities(client, country="EG", q="القَاهِرَة")] == [360630]
    assert [item["id"] for item in cities(client, country="EG", q="جيز")] == [360995]
    assert [item["id"] for item in cities(client, country="EG", q="القـاهرة")] == [360630]


def test_alternate_name_matches_rank_like_names(client, arabic_names):
    assert cities(client, country="EG", q="kairo")[0]["id"] == 360630
    assert cities(client, country="EG", q="gizeh")[0]["id"] == 360995
    # "al q" is a prefix of Cairo's alternate name and of the smaller "Al Qanatir": population decides.
    cairo_alt = cities(client, country="EG", q="القا")
    assert [item["id"] for item in cairo_alt] == [360630]
    caire = cities(client, country="EG", q="le caire")
    assert [item["id"] for item in caire] == [360630]


def test_alternate_name_exact_beats_bigger_prefix(client, db, arabic_names):
    add_city(db, city_id=999, country="EG", name="Kairouan Fake", population=99_000_000)
    assert [item["id"] for item in cities(client, country="EG", q="kairo")] == [360630, 999]


@pytest.mark.parametrize("query", ["%", "_", "c%o", "%%%", "\\", "/", "c_iro", "cairo|alexandria", "o|a"])
def test_like_wildcards_and_separator_are_literal(client, sample_geo, query):
    assert cities(client, country="EG", q=query) == []


def test_separator_only_query_is_blank(client, sample_geo):
    assert cities(client, country="EG", q=" | ") == cities(client, country="EG")


def test_control_characters_in_query_do_not_fail(client, sample_geo):
    assert cities(client, country="EG", q="cai\x00") == cities(client, country="EG", q="cai")
    assert [item["id"] for item in cities(client, country="EG", q="‏cairo")] == [360630]


def test_query_without_matches_returns_empty_list(client, sample_geo):
    assert cities(client, country="EG", q="atlantis") == []


def test_limit_bounds(client, springfields):
    assert len(cities(client, country="US", limit=1)) == 1
    assert len(cities(client, country="US", limit=50)) == 7
    assert len(cities(client, country="US", q="spring", limit=2)) == 2
    assert len(cities(client, country="US")) == 7  # default limit is 20
    for bad in (0, -1, 51, "ten"):
        assert field_errors(client.get(CITIES_URL, params={"country": "US", "limit": bad})) == ["limit"]


def test_default_limit_is_twenty(client, db, sample_geo):
    for index in range(25):
        add_city(db, city_id=1000 + index, country="GB", name=f"Town {index}", population=index)
    assert len(cities(client, country="GB")) == 20


def test_query_length_limit(client, sample_geo):
    assert cities(client, country="EG", q="x" * 100) == []
    assert cities(client, country="EG", q=f"  {'x' * 100}  ") == []  # trimmed before the length check
    assert field_errors(client.get(CITIES_URL, params={"country": "EG", "q": "x" * 101})) == ["q"]


def test_country_is_required(client, sample_geo):
    assert field_errors(client.get(CITIES_URL)) == ["country"]


@pytest.mark.parametrize("country", ["", "E", "EGY", "1A", "E1", "ÉG", "%%", "e g"])
def test_country_must_be_two_letters(client, sample_geo, country):
    assert field_errors(client.get(CITIES_URL, params={"country": country})) == ["country"]


def test_unknown_country_is_404(client, sample_geo):
    response = client.get(CITIES_URL, params={"country": "ZZ", "q": "cairo"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert "public" not in response.headers.get("cache-control", "")


def test_city_search_is_rate_limited(client, sample_geo, monkeypatch):
    from app.geo import router

    monkeypatch.setattr(router, "_CITY_SEARCH_LIMIT", 3)
    for _ in range(3):
        assert client.get(CITIES_URL, params={"country": "EG"}).status_code == 200
    response = client.get(CITIES_URL, params={"country": "EG"})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert "public" not in response.headers.get("cache-control", "")


# ---------------------------------------------------------------------------
# Service helpers used by other modules
# ---------------------------------------------------------------------------


def test_get_city_out(db, sample_geo):
    from app.geo.service import get_city_out

    london = get_city_out(db, 2643743, "en")
    assert london is not None
    assert london.label == "London, United Kingdom"
    assert london.timezone == "Europe/London"
    assert get_city_out(db, 2643743, "ar").label == "لندن، المملكة المتحدة"
    assert get_city_out(db, 42, "en") is None


def test_is_valid_timezone():
    assert importer.is_valid_timezone("Africa/Cairo")
    assert importer.is_valid_timezone("UTC")
    assert not importer.is_valid_timezone("")
    assert not importer.is_valid_timezone("Mars/Olympus_Mons")
    assert not importer.is_valid_timezone("../../etc/passwd")
