"""Admin editing of the pre-written free-plan readings (12 signs + 12 animals per locale)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.charts.schemas import CHINESE_ANIMALS, WESTERN_SIGNS
from app.content.admin_schemas import FreeReadingIn, FreeReadingOut
from app.content.common import field_error
from app.models import FreeReading, FreeReadingKind
from app.utils import supported_locales

KEYS_BY_KIND: dict[FreeReadingKind, tuple[str, ...]] = {
    FreeReadingKind.SIGN: WESTERN_SIGNS,
    FreeReadingKind.ANIMAL: CHINESE_ANIMALS,
}


def check_target(kind: FreeReadingKind, key: str, locale: str) -> None:
    if key not in KEYS_BY_KIND[kind]:
        raise field_error("key", f"Unknown {kind.value} key; use one of: {', '.join(KEYS_BY_KIND[kind])}")
    if locale not in supported_locales():
        raise field_error("locale", f"Unsupported locale; use one of: {', '.join(supported_locales())}")


def list_free_readings(db: Session, kind: FreeReadingKind | None, locale: str | None) -> list[FreeReadingOut]:
    """The full grid kind x key x locale (missing readings appear with ``id=None`` and empty text)."""
    kinds = [kind] if kind else list(KEYS_BY_KIND)
    locales = [locale] if locale else supported_locales()
    stmt = select(FreeReading).where(FreeReading.kind.in_(kinds), FreeReading.locale.in_(locales))
    stored = {(row.kind, row.key, row.locale): row for row in db.scalars(stmt)}
    items = []
    for k in kinds:
        for key in KEYS_BY_KIND[k]:
            for loc in locales:
                row = stored.get((k, key, loc))
                items.append(
                    FreeReadingOut(
                        id=row.id if row else None,
                        kind=k,
                        key=key,
                        locale=loc,
                        title=row.title if row else "",
                        body=row.body if row else "",
                        updated_at=row.updated_at if row else None,
                    )
                )
    return items


def upsert_free_reading(db: Session, kind: FreeReadingKind, key: str, locale: str, body: FreeReadingIn) -> FreeReading:
    """Insert or replace one reading (caller commits)."""
    check_target(kind, key, locale)
    stmt = pg_insert(FreeReading).values(kind=kind, key=key, locale=locale, title=body.title, body=body.body)
    reading_id = db.execute(
        stmt.on_conflict_do_update(
            index_elements=[FreeReading.kind, FreeReading.key, FreeReading.locale],
            set_={"title": stmt.excluded.title, "body": stmt.excluded.body, "updated_at": func.now()},
        ).returning(FreeReading.id)
    ).scalar_one()
    reading = db.get(FreeReading, reading_id, populate_existing=True)
    assert reading is not None
    return reading


def free_reading_out(reading: FreeReading) -> FreeReadingOut:
    return FreeReadingOut(
        id=reading.id,
        kind=reading.kind,
        key=reading.key,
        locale=reading.locale,
        title=reading.title,
        body=reading.body,
        updated_at=reading.updated_at,
    )
