"""Public content API, mounted at ``/api/v1`` (docs/ARCHITECTURE.md §5)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.content import blog, library, media, offers, site_content
from app.content.schemas import (
    MIN_BIRTH_DATE,
    Items,
    OfferOut,
    Page,
    PostOut,
    PostSummaryOut,
    PublicConfigOut,
    SeriesOut,
    SiteContentOut,
)
from app.db import get_db
from app.errors import not_found
from app.settings_store import get_all_settings
from app.utils import default_locale, normalize_locale, supported_locales, utcnow

router = APIRouter()

# Content is edited rarely and read on every page view; a short shared cache keeps edits visible quickly.
PUBLIC_CACHE = "public, max-age=60"
# Media file names are random and never reused, so the bytes behind a URL never change.
MEDIA_CACHE = "public, max-age=31536000, immutable"

LocaleParam = Annotated[str | None, Query(max_length=35, description="e.g. 'ar'; falls back to the default locale")]
SlugParam = Annotated[str, Path(min_length=1, max_length=200)]


def _cache_publicly(response: Response) -> None:
    response.headers["Cache-Control"] = PUBLIC_CACHE


@router.get("/public-config")
def public_config(response: Response, db: Session = Depends(get_db)) -> PublicConfigOut:
    values = get_all_settings(db)
    _cache_publicly(response)
    return PublicConfigOut(
        locales=supported_locales(),
        default_locale=default_locale(),
        paid_price_cents=values["paid_price_cents"],
        currency=values["currency"],
        report_access_hours=values["report_access_hours"],
        payment_provider=get_settings().payment_provider,
        min_birth_date=MIN_BIRTH_DATE,
    )


@router.get("/site-content")
def get_site_content(response: Response, locale: LocaleParam = None, db: Session = Depends(get_db)) -> SiteContentOut:
    _cache_publicly(response)
    return site_content.public_site_content(db, normalize_locale(locale))


@router.get("/offers")
def list_offers(
    response: Response,
    locale: LocaleParam = None,
    banner: Annotated[bool, Query(description="true: only offers shown as a banner")] = False,
    db: Session = Depends(get_db),
) -> Items[OfferOut]:
    now = utcnow()
    loc = normalize_locale(locale)
    rows = offers.live_offers(db, now, banner_only=banner)
    _cache_publicly(response)
    return Items[OfferOut](items=[offers.offer_out(o, loc, now) for o in rows])


@router.get("/offers/{slug}")
def get_offer(
    slug: SlugParam, response: Response, locale: LocaleParam = None, db: Session = Depends(get_db)
) -> OfferOut:
    now = utcnow()
    offer = offers.live_offer(db, slug, now)
    _cache_publicly(response)
    return offers.offer_out(offer, normalize_locale(locale), now)


@router.get("/blog")
def list_posts(
    response: Response,
    locale: LocaleParam = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 9,
    db: Session = Depends(get_db),
) -> Page[PostSummaryOut]:
    loc = normalize_locale(locale)
    rows, total = blog.published_posts(db, utcnow(), page, page_size)
    _cache_publicly(response)
    return Page[PostSummaryOut](
        items=[blog.post_summary_out(p, loc) for p in rows], total=total, page=page, page_size=page_size
    )


@router.get("/blog/{slug}")
def get_post(slug: SlugParam, response: Response, locale: LocaleParam = None, db: Session = Depends(get_db)) -> PostOut:
    post = blog.published_post(db, slug, utcnow())
    _cache_publicly(response)
    return blog.post_out(post, normalize_locale(locale))


@router.get("/library")
def list_library(response: Response, locale: LocaleParam = None, db: Session = Depends(get_db)) -> Items[SeriesOut]:
    loc = normalize_locale(locale)
    rows = library.published_series(db)
    _cache_publicly(response)
    return Items[SeriesOut](items=[library.series_out(s, loc) for s in rows])


@router.get("/library/{slug}")
def get_series(
    slug: SlugParam, response: Response, locale: LocaleParam = None, db: Session = Depends(get_db)
) -> SeriesOut:
    series = library.published_series_by_slug(db, slug)
    _cache_publicly(response)
    return library.series_out(series, normalize_locale(locale))


@router.get("/media/{file_name}", response_class=FileResponse)
def get_media_file(file_name: str) -> FileResponse:
    path = media.stored_path(file_name)
    if path is None:
        raise not_found("file")
    return FileResponse(
        path,
        media_type=media.content_type_for(file_name),
        headers={"Cache-Control": MEDIA_CACHE, "X-Content-Type-Options": "nosniff"},
    )
