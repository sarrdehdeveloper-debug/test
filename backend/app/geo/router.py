"""Public geo API, mounted at ``/api/v1/geo``: country list and city search for the birthplace picker."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.geo import service
from app.geo.schemas import CityList, CitySearchQuery, CountryList, LocaleQuery
from app.ratelimit import limiter
from app.utils import client_ip, normalize_locale

router = APIRouter()

# Place data only changes on re-import, so browsers/CDNs may cache answers for a day.
_CACHE_CONTROL = "public, max-age=86400"
# Generous: autocomplete fires on (debounced) keystrokes; this only stops scripted scraping.
_CITY_SEARCH_LIMIT = 240
_CITY_SEARCH_WINDOW_SECONDS = 60

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/countries", response_model=CountryList)
def get_countries(params: Annotated[LocaleQuery, Query()], response: Response, db: DbSession) -> CountryList:
    items = service.list_countries(db, normalize_locale(params.locale))
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return CountryList(items=items)


@router.get("/cities", response_model=CityList)
def get_cities(
    params: Annotated[CitySearchQuery, Query()], request: Request, response: Response, db: DbSession
) -> CityList:
    limiter.hit(f"geo-cities:{client_ip(request)}", _CITY_SEARCH_LIMIT, _CITY_SEARCH_WINDOW_SECONDS)
    items = service.search_cities(db, params.country, params.q, params.limit, normalize_locale(params.locale))
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return CityList(items=items)
