"""Galaxy Library: book series and their books (public listing + admin CRUD)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.content.admin_schemas import BookCreate, BookUpdate, SeriesCreate, SeriesUpdate
from app.content.common import apply_changes, flush_or_conflict, localized, paginate
from app.content.schemas import BookOut, SeriesOut
from app.errors import ApiError, not_found
from app.markdown import render_markdown
from app.models import Book, BookSeries

SERIES_SLUG_TAKEN = ("slug_taken", "A series with this slug already exists")
BOOK_SLUG_TAKEN = ("slug_taken", "A book with this slug already exists in this series")


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


def _published_series_stmt() -> Select[tuple[BookSeries]]:
    return (
        select(BookSeries)
        .options(selectinload(BookSeries.books))
        .where(BookSeries.is_published.is_(True))
        .order_by(BookSeries.sort_order, BookSeries.id)
    )


def published_series(db: Session) -> list[BookSeries]:
    return list(db.scalars(_published_series_stmt()))


def published_series_by_slug(db: Session, slug: str) -> BookSeries:
    series = db.scalar(_published_series_stmt().where(BookSeries.slug == slug))
    if series is None:
        raise not_found("series")
    return series


def _book_out(book: Book, locale: str) -> BookOut:
    text = localized(book.translations, locale)
    return BookOut(
        slug=book.slug,
        title=str(text.get("title") or ""),
        description_html=render_markdown(str(text.get("description") or "")),
        cover_image_url=book.cover_image_url,
        purchase_url=book.purchase_url,
    )


def series_out(series: BookSeries, locale: str) -> SeriesOut:
    """Public view: only the series' published books, in display order."""
    text = localized(series.translations, locale)
    books = sorted((b for b in series.books if b.is_published), key=lambda b: (b.sort_order, b.id))
    return SeriesOut(
        slug=series.slug,
        title=str(text.get("title") or ""),
        description_html=render_markdown(str(text.get("description") or "")),
        cover_image_url=series.cover_image_url,
        books=[_book_out(b, locale) for b in books],
    )


# ---------------------------------------------------------------------------
# Admin: series
# ---------------------------------------------------------------------------


def list_series(db: Session, page: int, page_size: int) -> tuple[list[BookSeries], int]:
    stmt = select(BookSeries).options(selectinload(BookSeries.books)).order_by(BookSeries.sort_order, BookSeries.id)
    return paginate(db, stmt, page, page_size)


def get_series(db: Session, series_id: int) -> BookSeries:
    series = db.get(BookSeries, series_id)
    if series is None:
        raise not_found("series")
    return series


def _check_series_slug_free(db: Session, slug: str, exclude_id: int | None = None) -> None:
    stmt = select(BookSeries.id).where(BookSeries.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(BookSeries.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise ApiError(409, *SERIES_SLUG_TAKEN)


def create_series(db: Session, body: SeriesCreate) -> BookSeries:
    _check_series_slug_free(db, body.slug)
    series = BookSeries(**body.model_dump(), books=[])
    db.add(series)
    flush_or_conflict(db, *SERIES_SLUG_TAKEN)
    return series


def update_series(db: Session, series: BookSeries, body: SeriesUpdate) -> list[str]:
    changes: dict[str, Any] = body.changes()
    if "slug" in changes:
        _check_series_slug_free(db, changes["slug"], exclude_id=series.id)
    changed = apply_changes(series, changes)
    flush_or_conflict(db, *SERIES_SLUG_TAKEN)
    return changed


def delete_series(db: Session, series: BookSeries) -> int:
    """Delete a series and its books; returns how many books went with it."""
    books_count = len(series.books)
    db.delete(series)
    db.flush()
    return books_count


# ---------------------------------------------------------------------------
# Admin: books
# ---------------------------------------------------------------------------


def get_book(db: Session, book_id: int) -> Book:
    book = db.get(Book, book_id)
    if book is None:
        raise not_found("book")
    return book


def _check_book_slug_free(db: Session, series_id: int, slug: str, exclude_id: int | None = None) -> None:
    stmt = select(Book.id).where(Book.series_id == series_id, Book.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Book.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise ApiError(409, *BOOK_SLUG_TAKEN)


def create_book(db: Session, series: BookSeries, body: BookCreate) -> Book:
    _check_book_slug_free(db, series.id, body.slug)
    book = Book(**body.model_dump())
    series.books.append(book)
    flush_or_conflict(db, *BOOK_SLUG_TAKEN)
    return book


def update_book(db: Session, book: Book, body: BookUpdate) -> list[str]:
    changes: dict[str, Any] = body.changes()
    if "slug" in changes:
        _check_book_slug_free(db, book.series_id, changes["slug"], exclude_id=book.id)
    changed = apply_changes(book, changes)
    flush_or_conflict(db, *BOOK_SLUG_TAKEN)
    return changed


def delete_book(db: Session, book: Book) -> None:
    book.series.books.remove(book)  # delete-orphan cascade removes the row
    db.flush()
