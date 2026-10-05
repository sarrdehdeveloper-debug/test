"""Content admin API (CMS), mounted at ``/api/v1/admin`` (docs/ARCHITECTURE.md §6).

Editors manage site copy, free readings, offers, the library, the blog and media; discounts and
business settings need a manager. Every mutation is audited in the same transaction as the change.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app import audit
from app.admin_auth.deps import require_editor, require_manager
from app.config import get_settings
from app.content import blog, discounts, free_readings, library, media, offers, site_content
from app.content.admin_schemas import (
    BookAdminOut,
    BookCreate,
    BookUpdate,
    DeleteOut,
    DiscountCreate,
    DiscountDeleteOut,
    DiscountOut,
    DiscountUpdate,
    FreeReadingIn,
    FreeReadingOut,
    FreeReadingQuery,
    HtmlOut,
    LocaleQuery,
    MarkdownPreviewIn,
    MediaOut,
    OfferAdminOut,
    OfferCreate,
    OfferUpdate,
    PostAdminOut,
    PostAdminSummary,
    PostCreate,
    PostListQuery,
    PostUpdate,
    SeriesAdminOut,
    SeriesCreate,
    SeriesUpdate,
    SettingsOut,
    SettingsUpdate,
    SiteContentAdminOut,
    SiteContentUpdate,
)
from app.content.schemas import MAX_DB_ID, Page, PageQuery
from app.db import get_db
from app.errors import ApiError
from app.markdown import render_markdown
from app.models import AdminUser, FreeReadingKind, Offer
from app.settings_store import DEFAULTS, InvalidSetting, get_all_settings, set_settings
from app.utils import client_ip, default_locale, utcnow

router = APIRouter()

EntityId = Annotated[int, Path(ge=1, le=MAX_DB_ID)]
Editor = Annotated[AdminUser, Depends(require_editor)]
Manager = Annotated[AdminUser, Depends(require_manager)]
Db = Annotated[Session, Depends(get_db)]

_UPLOAD_OPENAPI: dict[str, Any] = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file"],
                    "properties": {"file": {"type": "string", "format": "binary"}},
                }
            }
        },
    }
}


def _audit(
    db: Session,
    request: Request,
    user: AdminUser,
    action: str,
    entity_type: str,
    entity_id: object | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    audit.record(db, user, action, entity_type, entity_id, data, ip=client_ip(request))


# ---------------------------------------------------------------------------
# Site content
# ---------------------------------------------------------------------------


@router.get("/site-content")
def get_site_content(params: Annotated[LocaleQuery, Query()], _user: Editor, db: Db) -> SiteContentAdminOut:
    return site_content.admin_site_content(db, params.locale or default_locale())


@router.put("/site-content")
def update_site_content(body: SiteContentUpdate, request: Request, user: Editor, db: Db) -> SiteContentAdminOut:
    changed = site_content.update_site_content(db, body)
    if changed:
        _audit(db, request, user, "site_content.update", "site_content", body.locale, {"keys": changed})
    db.commit()
    return site_content.admin_site_content(db, body.locale)


# ---------------------------------------------------------------------------
# Free readings
# ---------------------------------------------------------------------------


@router.get("/free-readings")
def list_free_readings(params: Annotated[FreeReadingQuery, Query()], _user: Editor, db: Db) -> Page[FreeReadingOut]:
    items = free_readings.list_free_readings(db, params.kind, params.locale)
    return Page[FreeReadingOut](items=items, total=len(items), page=1, page_size=max(len(items), 1))


@router.put("/free-readings/{kind}/{key}/{locale}")
def upsert_free_reading(
    kind: FreeReadingKind,
    key: Annotated[str, Path(max_length=32)],
    locale: Annotated[str, Path(max_length=16)],
    body: FreeReadingIn,
    request: Request,
    user: Editor,
    db: Db,
) -> FreeReadingOut:
    reading = free_readings.upsert_free_reading(db, kind, key, locale, body)
    _audit(
        db,
        request,
        user,
        "free_reading.update",
        "free_reading",
        reading.id,
        {"kind": kind.value, "key": key, "locale": locale},
    )
    db.commit()
    return free_readings.free_reading_out(reading)


# ---------------------------------------------------------------------------
# Offers
# ---------------------------------------------------------------------------


def _offer_out(offer: Offer) -> OfferAdminOut:
    return OfferAdminOut.from_row(offer, is_live=offers.is_live(offer, utcnow()))


@router.get("/offers")
def list_offers(params: Annotated[PageQuery, Query()], _user: Editor, db: Db) -> Page[OfferAdminOut]:
    rows, total = offers.list_offers(db, params.page, params.page_size)
    return Page[OfferAdminOut](
        items=[_offer_out(o) for o in rows], total=total, page=params.page, page_size=params.page_size
    )


@router.post("/offers", status_code=201)
def create_offer(body: OfferCreate, request: Request, user: Editor, db: Db) -> OfferAdminOut:
    offer = offers.create_offer(db, body)
    _audit(db, request, user, "offer.create", "offer", offer.id, {"slug": offer.slug})
    db.commit()
    return _offer_out(offer)


@router.get("/offers/{offer_id}")
def get_offer(offer_id: EntityId, _user: Editor, db: Db) -> OfferAdminOut:
    return _offer_out(offers.get_offer(db, offer_id))


@router.patch("/offers/{offer_id}")
def update_offer(offer_id: EntityId, body: OfferUpdate, request: Request, user: Editor, db: Db) -> OfferAdminOut:
    offer = offers.get_offer(db, offer_id)
    changed = offers.update_offer(db, offer, body)
    if changed:
        _audit(db, request, user, "offer.update", "offer", offer.id, {"slug": offer.slug, "fields": changed})
    db.commit()
    return _offer_out(offer)


@router.delete("/offers/{offer_id}")
def delete_offer(offer_id: EntityId, request: Request, user: Editor, db: Db) -> DeleteOut:
    offer = offers.get_offer(db, offer_id)
    _audit(db, request, user, "offer.delete", "offer", offer.id, {"slug": offer.slug})
    offers.delete_offer(db, offer)
    db.commit()
    return DeleteOut()


# ---------------------------------------------------------------------------
# Discounts (managers)
# ---------------------------------------------------------------------------


@router.get("/discounts")
def list_discounts(params: Annotated[PageQuery, Query()], _user: Manager, db: Db) -> Page[DiscountOut]:
    rows, total = discounts.list_discounts(db, params.page, params.page_size)
    return Page[DiscountOut](
        items=[DiscountOut.from_row(d) for d in rows], total=total, page=params.page, page_size=params.page_size
    )


@router.post("/discounts", status_code=201)
def create_discount(body: DiscountCreate, request: Request, user: Manager, db: Db) -> DiscountOut:
    discount = discounts.create_discount(db, body)
    _audit(
        db,
        request,
        user,
        "discount.create",
        "discount",
        discount.id,
        {"code": discount.code, "kind": discount.kind.value, "value": discount.value},
    )
    db.commit()
    return DiscountOut.from_row(discount)


@router.get("/discounts/{discount_id}")
def get_discount(discount_id: EntityId, _user: Manager, db: Db) -> DiscountOut:
    return DiscountOut.from_row(discounts.get_discount(db, discount_id))


@router.patch("/discounts/{discount_id}")
def update_discount(
    discount_id: EntityId, body: DiscountUpdate, request: Request, user: Manager, db: Db
) -> DiscountOut:
    discount = discounts.get_discount(db, discount_id)
    changed = discounts.update_discount(db, discount, body)
    if changed:
        _audit(
            db, request, user, "discount.update", "discount", discount.id, {"code": discount.code, "fields": changed}
        )
    db.commit()
    return DiscountOut.from_row(discount)


@router.delete("/discounts/{discount_id}")
def delete_discount(discount_id: EntityId, request: Request, user: Manager, db: Db) -> DiscountDeleteOut:
    discount = discounts.get_discount(db, discount_id)
    code = discount.code
    deleted = discounts.delete_or_deactivate(db, discount)
    action = "discount.delete" if deleted else "discount.deactivate"
    _audit(db, request, user, action, "discount", discount_id, {"code": code})
    db.commit()
    return DiscountDeleteOut(deleted=deleted, deactivated=not deleted)


# ---------------------------------------------------------------------------
# Galaxy Library
# ---------------------------------------------------------------------------


@router.get("/book-series")
def list_series(params: Annotated[PageQuery, Query()], _user: Editor, db: Db) -> Page[SeriesAdminOut]:
    rows, total = library.list_series(db, params.page, params.page_size)
    return Page[SeriesAdminOut](
        items=[SeriesAdminOut.from_row(s) for s in rows], total=total, page=params.page, page_size=params.page_size
    )


@router.post("/book-series", status_code=201)
def create_series(body: SeriesCreate, request: Request, user: Editor, db: Db) -> SeriesAdminOut:
    series = library.create_series(db, body)
    _audit(db, request, user, "book_series.create", "book_series", series.id, {"slug": series.slug})
    db.commit()
    return SeriesAdminOut.from_row(series)


@router.get("/book-series/{series_id}")
def get_series(series_id: EntityId, _user: Editor, db: Db) -> SeriesAdminOut:
    return SeriesAdminOut.from_row(library.get_series(db, series_id))


@router.patch("/book-series/{series_id}")
def update_series(series_id: EntityId, body: SeriesUpdate, request: Request, user: Editor, db: Db) -> SeriesAdminOut:
    series = library.get_series(db, series_id)
    changed = library.update_series(db, series, body)
    if changed:
        _audit(
            db, request, user, "book_series.update", "book_series", series.id, {"slug": series.slug, "fields": changed}
        )
    db.commit()
    return SeriesAdminOut.from_row(series)


@router.delete("/book-series/{series_id}")
def delete_series(series_id: EntityId, request: Request, user: Editor, db: Db) -> DeleteOut:
    series = library.get_series(db, series_id)
    data = {"slug": series.slug, "books_deleted": len(series.books)}
    _audit(db, request, user, "book_series.delete", "book_series", series.id, data)
    library.delete_series(db, series)
    db.commit()
    return DeleteOut()


@router.post("/book-series/{series_id}/books", status_code=201)
def create_book(series_id: EntityId, body: BookCreate, request: Request, user: Editor, db: Db) -> BookAdminOut:
    series = library.get_series(db, series_id)
    book = library.create_book(db, series, body)
    _audit(db, request, user, "book.create", "book", book.id, {"slug": book.slug, "series_id": series.id})
    db.commit()
    return BookAdminOut.from_row(book)


@router.get("/books/{book_id}")
def get_book(book_id: EntityId, _user: Editor, db: Db) -> BookAdminOut:
    return BookAdminOut.from_row(library.get_book(db, book_id))


@router.patch("/books/{book_id}")
def update_book(book_id: EntityId, body: BookUpdate, request: Request, user: Editor, db: Db) -> BookAdminOut:
    book = library.get_book(db, book_id)
    changed = library.update_book(db, book, body)
    if changed:
        _audit(db, request, user, "book.update", "book", book.id, {"slug": book.slug, "fields": changed})
    db.commit()
    return BookAdminOut.from_row(book)


@router.delete("/books/{book_id}")
def delete_book(book_id: EntityId, request: Request, user: Editor, db: Db) -> DeleteOut:
    book = library.get_book(db, book_id)
    _audit(db, request, user, "book.delete", "book", book.id, {"slug": book.slug, "series_id": book.series_id})
    library.delete_book(db, book)
    db.commit()
    return DeleteOut()


# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------


@router.get("/blog-posts")
def list_posts(params: Annotated[PostListQuery, Query()], _user: Editor, db: Db) -> Page[PostAdminSummary]:
    rows, total = blog.list_posts(db, params.status, params.page, params.page_size)
    return Page[PostAdminSummary](
        items=[PostAdminSummary.from_row(p) for p in rows], total=total, page=params.page, page_size=params.page_size
    )


@router.post("/blog-posts", status_code=201)
def create_post(body: PostCreate, request: Request, user: Editor, db: Db) -> PostAdminOut:
    post = blog.create_post(db, body)
    _audit(db, request, user, "blog_post.create", "blog_post", post.id, {"slug": post.slug})
    db.commit()
    return PostAdminOut.from_row(post)


@router.get("/blog-posts/{post_id}")
def get_post(post_id: EntityId, _user: Editor, db: Db) -> PostAdminOut:
    return PostAdminOut.from_row(blog.get_post(db, post_id))


@router.patch("/blog-posts/{post_id}")
def update_post(post_id: EntityId, body: PostUpdate, request: Request, user: Editor, db: Db) -> PostAdminOut:
    post = blog.get_post(db, post_id)
    changed = blog.update_post(db, post, body)
    if changed:
        _audit(db, request, user, "blog_post.update", "blog_post", post.id, {"slug": post.slug, "fields": changed})
    db.commit()
    return PostAdminOut.from_row(post)


@router.delete("/blog-posts/{post_id}")
def delete_post(post_id: EntityId, request: Request, user: Editor, db: Db) -> DeleteOut:
    post = blog.get_post(db, post_id)
    _audit(db, request, user, "blog_post.delete", "blog_post", post.id, {"slug": post.slug})
    blog.delete_post(db, post)
    db.commit()
    return DeleteOut()


@router.post("/blog-posts/{post_id}/publish")
def publish_post(post_id: EntityId, request: Request, user: Editor, db: Db) -> PostAdminOut:
    post = blog.get_post(db, post_id)
    if blog.publish_post(db, post, utcnow()):
        _audit(db, request, user, "blog_post.publish", "blog_post", post.id, {"slug": post.slug})
    db.commit()
    return PostAdminOut.from_row(post)


@router.post("/blog-posts/{post_id}/unpublish")
def unpublish_post(post_id: EntityId, request: Request, user: Editor, db: Db) -> PostAdminOut:
    post = blog.get_post(db, post_id)
    if blog.unpublish_post(db, post):
        _audit(db, request, user, "blog_post.unpublish", "blog_post", post.id, {"slug": post.slug})
    db.commit()
    return PostAdminOut.from_row(post)


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------


def _save_upload(db: Session, request: Request, user: AdminUser, upload: media.UploadedFile) -> MediaOut:
    image = media.process_image(upload.data)
    row = media.create_media(db, image, upload.filename)
    _audit(
        db, request, user, "media.upload", "media", row.id, {"file_name": row.file_name, "size_bytes": row.size_bytes}
    )
    try:
        db.commit()
    except BaseException:
        db.rollback()
        media.remove_file(row.file_name)
        raise
    return media.media_out(row)


@router.post("/media", status_code=201, openapi_extra=_UPLOAD_OPENAPI)
async def upload_media(request: Request, user: Editor, db: Db) -> MediaOut:
    # The body is parsed here (after authentication) rather than via File(): see media.read_upload.
    upload = await media.read_upload(request, get_settings().max_upload_bytes)
    # Pillow decoding and the sync DB session must not block the event loop.
    return await run_in_threadpool(_save_upload, db, request, user, upload)


@router.get("/media")
def list_media(params: Annotated[PageQuery, Query()], _user: Editor, db: Db) -> Page[MediaOut]:
    rows, total = media.list_media(db, params.page, params.page_size)
    return Page[MediaOut](
        items=[media.media_out(m) for m in rows], total=total, page=params.page, page_size=params.page_size
    )


@router.delete("/media/{media_id}")
def delete_media(media_id: EntityId, request: Request, user: Editor, db: Db) -> DeleteOut:
    row = media.get_media(db, media_id)
    file_name = row.file_name
    _audit(db, request, user, "media.delete", "media", row.id, {"file_name": file_name})
    media.delete_media(db, row)
    db.commit()
    media.remove_file(file_name)  # only after the commit, so a failed transaction never loses the file
    return DeleteOut()


# ---------------------------------------------------------------------------
# Markdown preview
# ---------------------------------------------------------------------------


@router.post("/markdown/preview")
def preview_markdown(body: MarkdownPreviewIn, _user: Editor) -> HtmlOut:
    return HtmlOut(html=render_markdown(body.markdown))


# ---------------------------------------------------------------------------
# Business settings (managers)
# ---------------------------------------------------------------------------


@router.get("/settings")
def get_settings_values(_user: Manager, db: Db) -> SettingsOut:
    return SettingsOut(values=get_all_settings(db), defaults=DEFAULTS)


@router.put("/settings")
def update_settings(body: SettingsUpdate, request: Request, user: Manager, db: Db) -> SettingsOut:
    before = get_all_settings(db)
    try:
        after = set_settings(db, body.values)
    except InvalidSetting as exc:
        db.rollback()
        raise ApiError(422, "invalid_setting", str(exc)) from exc
    changes = {key: {"from": before[key], "to": after[key]} for key in body.values if before[key] != after[key]}
    if changes:
        _audit(db, request, user, "settings.update", "settings", None, {"changes": changes})
    db.commit()
    return SettingsOut(values=after, defaults=DEFAULTS)
