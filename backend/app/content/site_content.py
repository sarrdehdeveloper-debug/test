"""Editable site copy (``site_content`` rows keyed by ``app.content.keys``)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.content.admin_schemas import CONTENT_KEYS_OUT, SiteContentAdminOut, SiteContentUpdate
from app.content.keys import SITE_CONTENT_KEYS
from app.content.schemas import SiteContentOut
from app.markdown import render_markdown
from app.models import SiteContent
from app.utils import default_locale


def _values(db: Session, locales: set[str]) -> dict[tuple[str, str], str]:
    rows = db.execute(
        select(SiteContent.key, SiteContent.locale, SiteContent.value).where(SiteContent.locale.in_(locales))
    )
    return {(key, loc): value for key, loc, value in rows}


def _first_filled(*candidates: str | None) -> str:
    return next((value for value in candidates if value and value.strip()), "")


def public_site_content(db: Session, locale: str) -> SiteContentOut:
    """Every known key, falling back per key to the default locale and then to ""."""
    fallback = default_locale()
    values = _values(db, {locale, fallback})
    items: dict[str, str] = {}
    html: dict[str, str] = {}
    for content_key in SITE_CONTENT_KEYS:
        value = _first_filled(values.get((content_key.key, locale)), values.get((content_key.key, fallback)))
        items[content_key.key] = value
        if content_key.format == "markdown":
            html[content_key.key] = render_markdown(value) if value else ""
    return SiteContentOut(locale=locale, items=items, html=html)


def admin_site_content(db: Session, locale: str) -> SiteContentAdminOut:
    """Stored values for exactly ``locale`` (no fallback, so editors see what is missing)."""
    values = _values(db, {locale})
    items = {k.key: values.get((k.key, locale), "") for k in SITE_CONTENT_KEYS}
    return SiteContentAdminOut(locale=locale, items=items, keys=CONTENT_KEYS_OUT)


def update_site_content(db: Session, body: SiteContentUpdate) -> list[str]:
    """Upsert the submitted keys for one locale; returns the keys whose value changed (caller commits)."""
    current = _values(db, {body.locale})
    changed = sorted(key for key, value in body.items.items() if current.get((key, body.locale), "") != value)
    if not changed:
        return []
    stmt = pg_insert(SiteContent).values(
        [{"key": key, "locale": body.locale, "value": body.items[key]} for key in changed]
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=[SiteContent.key, SiteContent.locale],
            set_={"value": stmt.excluded.value, "updated_at": func.now()},
        )
    )
    return changed
