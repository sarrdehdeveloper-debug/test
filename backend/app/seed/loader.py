"""Idempotent seed loader (``python -m app.cli seed [--force]``).

What gets loaded: site content for every key in ``app.content.keys`` (en + ar), the pre-written free
readings from ``data/free_readings_<locale>.json`` (when present), the six published report prompts,
and sample commercial content (launch discount and offer, Galaxy Library, blog posts).

Ownership rules
- Without ``force`` only missing rows are inserted; existing rows are never modified, so admin edits
  always win. This matters because deployments run ``seed`` on every start.
- Sample rows (discount, offer, library, blog) are deletable in the dashboard. Each seeded sample is
  recorded with a ``seed.insert`` audit entry, so a sample an admin deleted is not resurrected by
  the next deploy.
- With ``force`` the fields the seed defines are restored (translations of other locales and fields
  the seed does not define, such as images, dates and counters, are kept) and deleted samples are
  re-created.
- Prompt versions are immutable once published (orders reference them), so ``force`` publishes a new
  version with the seed content instead of rewriting an existing one.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable, Mapping
from datetime import timedelta
from pathlib import Path
from typing import Any, Final, TypeVar

from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.content.keys import KEYS_BY_NAME
from app.db import Base, session_scope
from app.models import (
    AuditLog,
    BlogPost,
    Book,
    BookSeries,
    DiscountCode,
    FreeReading,
    FreeReadingKind,
    Offer,
    PostStatus,
    PromptStatus,
    PromptVersion,
    SiteContent,
)
from app.seed.prompts import PROMPTS
from app.seed.samples import BLOG_POSTS, DISCOUNTS, LIBRARY, OFFERS
from app.seed.schemas import FreeReadingFile, PromptSeed
from app.seed.site_content import SITE_CONTENT
from app.utils import utcnow

logger = logging.getLogger(__name__)

DATA_DIR: Path = Path(__file__).resolve().parent / "data"

SEED_INSERT_ACTION: Final = "seed.insert"
SEED_RUN_ACTION: Final = "seed.run"
CATEGORIES: Final = (
    "site_content",
    "free_readings",
    "prompts",
    "discount_codes",
    "offers",
    "book_series",
    "books",
    "blog_posts",
)

_FREE_READING_FILE_RE: Final = re.compile(r"^free_readings_([a-z]{2,3})\.json$")
# Serialises concurrent seed runs (e.g. two containers starting at once) for this transaction.
_ADVISORY_LOCK_KEY: Final = 0x5A42_5345_4544

RowT = TypeVar("RowT", bound=Base)


class SeedDataError(ValueError):
    """A seed data file exists but is malformed."""


class SeedCounts:
    """Inserted/updated row counts per category, returned as ``{"<category>_inserted": n, ...}``."""

    def __init__(self) -> None:
        self._counts: dict[str, int] = {f"{c}_{op}": 0 for c in CATEGORIES for op in ("inserted", "updated")}

    def inserted(self, category: str) -> None:
        self._counts[f"{category}_inserted"] += 1

    def updated(self, category: str) -> None:
        self._counts[f"{category}_updated"] += 1

    @property
    def total(self) -> int:
        return sum(self._counts.values())

    def as_dict(self) -> dict[str, int]:
        return dict(self._counts)


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------


def run_seed(force: bool = False) -> dict[str, int]:
    """Seed the database in one transaction; returns inserted/updated counts per category."""
    with session_scope() as db:
        counts = seed_database(db, force=force)
    logger.info("Seed finished (force=%s): %s", force, {k: v for k, v in counts.items() if v})
    return counts


def seed_database(db: Session, *, force: bool = False) -> dict[str, int]:
    """Seed using the caller's session and transaction (flushes, does not commit)."""
    db.execute(select(func.pg_advisory_xact_lock(_ADVISORY_LOCK_KEY)))
    counts = SeedCounts()
    _seed_site_content(db, counts, force=force)
    _seed_free_readings(db, counts, force=force)
    _seed_prompts(db, counts, force=force)
    _seed_discounts(db, counts, force=force)
    _seed_offers(db, counts, force=force)
    _seed_library(db, counts, force=force)
    _seed_blog(db, counts, force=force)
    result = counts.as_dict()
    if counts.total:
        changed = {key: value for key, value in result.items() if value}
        audit.record(db, None, SEED_RUN_ACTION, "seed", data={"force": force, "counts": changed})
    db.flush()
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _assign(row: object, values: Mapping[str, Any]) -> bool:
    """Set attributes that differ; return True when anything changed."""
    changed = False
    for field, value in values.items():
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed = True
    return changed


def _translations(seed: Mapping[str, BaseModel], current: Mapping[str, Any] | None) -> dict[str, Any]:
    """Seed translations merged over the current ones, keeping locales the seed does not define."""
    merged = dict(current or {})
    merged.update({locale: value.model_dump() for locale, value in seed.items()})
    return merged


def _was_seeded(db: Session, entity_type: str, seed_key: str) -> bool:
    stmt = (
        select(AuditLog.id)
        .where(
            AuditLog.action == SEED_INSERT_ACTION,
            AuditLog.entity_type == entity_type,
            AuditLog.data["seed_key"].astext == seed_key,
        )
        .limit(1)
    )
    return db.scalar(stmt) is not None


def _seed_sample(
    db: Session,
    counts: SeedCounts,
    *,
    category: str,
    entity_type: str,
    seed_key: str,
    row: RowT | None,
    create: Callable[[], RowT],
    values: Mapping[str, Any],
    force: bool,
) -> RowT | None:
    """Insert a missing sample row (unless an admin deleted it) or, with ``force``, restore its fields."""
    if row is None:
        if not force and _was_seeded(db, entity_type, seed_key):
            return None
        row = create()
        _assign(row, values)
        db.add(row)
        db.flush()
        audit.record(db, None, SEED_INSERT_ACTION, entity_type, row.id, data={"seed_key": seed_key})  # type: ignore[attr-defined]
        counts.inserted(category)
        return row
    if force and _assign(row, values):
        counts.updated(category)
    return row


# ---------------------------------------------------------------------------
# Site content & free readings
# ---------------------------------------------------------------------------


def _seed_site_content(db: Session, counts: SeedCounts, *, force: bool) -> None:
    existing = {(row.key, row.locale): row for row in db.scalars(select(SiteContent))}
    for locale, values in SITE_CONTENT.items():
        for key, value in values.items():
            if key not in KEYS_BY_NAME:
                logger.warning("Skipping unknown site content key %r", key)
                continue
            row = existing.get((key, locale))
            if row is None:
                db.add(SiteContent(key=key, locale=locale, value=value))
                counts.inserted("site_content")
            elif force and _assign(row, {"value": value}):
                counts.updated("site_content")


def load_free_reading_files(data_dir: Path) -> dict[str, FreeReadingFile]:
    """Parse every ``free_readings_<locale>.json`` in ``data_dir``; missing files are simply absent."""
    files: dict[str, FreeReadingFile] = {}
    if not data_dir.is_dir():
        return files
    for path in sorted(data_dir.glob("free_readings_*.json")):
        match = _FREE_READING_FILE_RE.fullmatch(path.name)
        if match is None:
            logger.warning("Ignoring unexpected seed file %s", path.name)
            continue
        try:
            files[match.group(1)] = FreeReadingFile.model_validate(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError, ValidationError) as exc:  # JSONDecodeError is a ValueError
            raise SeedDataError(f"{path.name} is not a valid free readings file: {exc}") from exc
    return files


def _seed_free_readings(db: Session, counts: SeedCounts, *, force: bool) -> None:
    files = load_free_reading_files(DATA_DIR)
    if not files:
        logger.info("No free reading files in %s; skipping free readings", DATA_DIR)
        return
    existing = {(row.kind, row.key, row.locale): row for row in db.scalars(select(FreeReading))}
    for locale, data in files.items():
        for kind, entries in ((FreeReadingKind.SIGN, data.sign), (FreeReadingKind.ANIMAL, data.animal)):
            for key, entry in entries.items():
                values = {"title": entry.title, "body": entry.body}
                row = existing.get((kind, key, locale))
                if row is None:
                    db.add(FreeReading(kind=kind, key=key, locale=locale, **values))
                    counts.inserted("free_readings")
                elif force and _assign(row, values):
                    counts.updated("free_readings")


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


def _prompt_values(seed: PromptSeed) -> dict[str, Any]:
    return {
        "name": seed.name,
        "section_titles": dict(seed.section_titles),
        "template": seed.template,
        "system_instruction": seed.system_instruction,
        "min_words": seed.min_words,
        "notes": seed.notes,
    }


def _matches_seed(version: PromptVersion, seed: PromptSeed) -> bool:
    # Notes are internal; only fields that change the generated report count as a difference.
    values = _prompt_values(seed)
    return all(getattr(version, field) == values[field] for field in values if field != "notes")


def _new_published_version(seed: PromptSeed, version: int) -> PromptVersion:
    return PromptVersion(
        slot=seed.slot,
        version=version,
        status=PromptStatus.PUBLISHED,
        published_at=utcnow(),
        **_prompt_values(seed),
    )


def _seed_prompts(db: Session, counts: SeedCounts, *, force: bool) -> None:
    for seed in PROMPTS:
        versions = db.scalars(
            select(PromptVersion).where(PromptVersion.slot == seed.slot).order_by(PromptVersion.version)
        ).all()
        if not versions:
            db.add(_new_published_version(seed, version=1))
            counts.inserted("prompts")
            continue
        if not force:
            continue  # the slot belongs to the admins once it has any version
        published = next((v for v in versions if v.status == PromptStatus.PUBLISHED), None)
        if published is not None and _matches_seed(published, seed):
            continue
        if published is not None:
            published.status = PromptStatus.ARCHIVED
            db.flush()  # the partial unique index allows only one published version per slot
        db.add(_new_published_version(seed, version=versions[-1].version + 1))
        counts.updated("prompts")
    db.flush()


# ---------------------------------------------------------------------------
# Samples: discounts, offers, library, blog
# ---------------------------------------------------------------------------


def _seed_discounts(db: Session, counts: SeedCounts, *, force: bool) -> None:
    for seed in DISCOUNTS:
        row = db.scalar(select(DiscountCode).where(DiscountCode.code == seed.code))
        _seed_sample(
            db,
            counts,
            category="discount_codes",
            entity_type="discount_code",
            seed_key=seed.code,
            row=row,
            create=lambda seed=seed: DiscountCode(code=seed.code),
            # redemptions_count, dates and limits are left alone: they are operational data.
            values={
                "description": seed.description,
                "kind": seed.kind,
                "value": seed.value,
                "currency": seed.currency,
                "is_active": seed.is_active,
            },
            force=force,
        )


def _seed_offers(db: Session, counts: SeedCounts, *, force: bool) -> None:
    for seed in OFFERS:
        row = db.scalar(select(Offer).where(Offer.slug == seed.slug))
        discount_id = (
            db.scalar(select(DiscountCode.id).where(DiscountCode.code == seed.discount_code))
            if seed.discount_code
            else None
        )
        _seed_sample(
            db,
            counts,
            category="offers",
            entity_type="offer",
            seed_key=seed.slug,
            row=row,
            create=lambda seed=seed: Offer(slug=seed.slug),
            values={
                "translations": _translations(seed.translations, row.translations if row else None),
                "cta_url": seed.cta_url,
                "discount_code_id": discount_id,
                "show_banner": seed.show_banner,
                "is_active": seed.is_active,
                "sort_order": seed.sort_order,
            },
            force=force,
        )


def _seed_library(db: Session, counts: SeedCounts, *, force: bool) -> None:
    for seed in LIBRARY:
        series = db.scalar(select(BookSeries).where(BookSeries.slug == seed.slug))
        series = _seed_sample(
            db,
            counts,
            category="book_series",
            entity_type="book_series",
            seed_key=seed.slug,
            row=series,
            create=lambda seed=seed: BookSeries(slug=seed.slug),
            values={
                "translations": _translations(seed.translations, series.translations if series else None),
                "is_published": seed.is_published,
                "sort_order": seed.sort_order,
            },
            force=force,
        )
        if series is None:
            continue
        for book_seed in seed.books:
            book = db.scalar(select(Book).where(Book.series_id == series.id, Book.slug == book_seed.slug))
            _seed_sample(
                db,
                counts,
                category="books",
                entity_type="book",
                seed_key=f"{seed.slug}/{book_seed.slug}",
                row=book,
                # purchase_url is only set on insert: admins add the real store links later.
                create=lambda book_seed=book_seed, series_id=series.id: Book(
                    series_id=series_id, slug=book_seed.slug, purchase_url=book_seed.purchase_url
                ),
                values={
                    "translations": _translations(book_seed.translations, book.translations if book else None),
                    "is_published": book_seed.is_published,
                    "sort_order": book_seed.sort_order,
                },
                force=force,
            )


def _seed_blog(db: Session, counts: SeedCounts, *, force: bool) -> None:
    now = utcnow()
    for seed in BLOG_POSTS:
        post = db.scalar(select(BlogPost).where(BlogPost.slug == seed.slug))
        published_at = now - timedelta(days=seed.published_days_ago)
        _seed_sample(
            db,
            counts,
            category="blog_posts",
            entity_type="blog_post",
            seed_key=seed.slug,
            row=post,
            create=lambda seed=seed, published_at=published_at: BlogPost(slug=seed.slug, published_at=published_at),
            values={
                "translations": _translations(seed.translations, post.translations if post else None),
                "author_name": seed.author_name,
                "status": PostStatus.PUBLISHED,
                # Keep the original publication date when restoring a post.
                "published_at": (post.published_at if post and post.published_at else published_at),
            },
            force=force,
        )
