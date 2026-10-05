"""Blog posts: public listing/detail (published only) and admin CRUD + publish workflow."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, and_, select
from sqlalchemy.orm import Session

from app.content.admin_schemas import PostCreate, PostUpdate
from app.content.common import (
    apply_changes,
    field_error,
    flush_or_conflict,
    localized,
    paginate,
    text_or_none,
    titled_locales,
)
from app.content.schemas import PostOut, PostSummaryOut
from app.errors import ApiError, not_found
from app.markdown import render_markdown
from app.models import BlogPost, PostStatus
from app.utils import default_locale

SLUG_TAKEN = ("slug_taken", "A post with this slug already exists")


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


def _visible_clause(now: datetime) -> ColumnElement[bool]:
    # A future published_at schedules the post: it stays hidden until then.
    return and_(
        BlogPost.status == PostStatus.PUBLISHED,
        BlogPost.published_at.is_not(None),
        BlogPost.published_at <= now,
    )


def published_posts(db: Session, now: datetime, page: int, page_size: int) -> tuple[list[BlogPost], int]:
    stmt = select(BlogPost).where(_visible_clause(now)).order_by(BlogPost.published_at.desc(), BlogPost.id.desc())
    return paginate(db, stmt, page, page_size)


def published_post(db: Session, slug: str, now: datetime) -> BlogPost:
    post = db.scalar(select(BlogPost).where(BlogPost.slug == slug, _visible_clause(now)))
    if post is None:
        raise not_found("post")
    return post


def post_summary_out(post: BlogPost, locale: str) -> PostSummaryOut:
    text = localized(post.translations, locale)
    return PostSummaryOut(
        slug=post.slug,
        title=str(text.get("title") or ""),
        excerpt=str(text.get("excerpt") or ""),
        cover_image_url=post.cover_image_url,
        author_name=post.author_name,
        published_at=post.published_at,
    )


def post_out(post: BlogPost, locale: str) -> PostOut:
    text = localized(post.translations, locale)
    return PostOut(
        **post_summary_out(post, locale).model_dump(),
        body_html=render_markdown(str(text.get("body") or "")),
        seo_title=text_or_none(text.get("seo_title")),
        seo_description=text_or_none(text.get("seo_description")),
        available_locales=titled_locales(post.translations),
    )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


def list_posts(db: Session, status: PostStatus | None, page: int, page_size: int) -> tuple[list[BlogPost], int]:
    stmt = select(BlogPost).order_by(BlogPost.updated_at.desc(), BlogPost.id.desc())
    if status is not None:
        stmt = stmt.where(BlogPost.status == status)
    return paginate(db, stmt, page, page_size)


def get_post(db: Session, post_id: int) -> BlogPost:
    post = db.get(BlogPost, post_id)
    if post is None:
        raise not_found("post")
    return post


def _check_slug_free(db: Session, slug: str, exclude_id: int | None = None) -> None:
    stmt = select(BlogPost.id).where(BlogPost.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(BlogPost.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise ApiError(409, *SLUG_TAKEN)


def create_post(db: Session, body: PostCreate) -> BlogPost:
    _check_slug_free(db, body.slug)
    post = BlogPost(**body.model_dump(), status=PostStatus.DRAFT)
    db.add(post)
    flush_or_conflict(db, *SLUG_TAKEN)
    return post


def update_post(db: Session, post: BlogPost, body: PostUpdate) -> list[str]:
    changes: dict[str, Any] = body.changes()
    if "slug" in changes:
        _check_slug_free(db, changes["slug"], exclude_id=post.id)
    if "published_at" in changes and changes["published_at"] is None and post.status == PostStatus.PUBLISHED:
        raise field_error("published_at", "A published post needs a publication date; unpublish it instead")
    changed = apply_changes(post, changes)
    flush_or_conflict(db, *SLUG_TAKEN)
    return changed


def publish_post(db: Session, post: BlogPost, now: datetime) -> bool:
    """Publish; keeps an existing (possibly scheduled) published_at. Returns False if already published."""
    body = str(((post.translations or {}).get(default_locale()) or {}).get("body") or "").strip()
    if not body:
        raise ApiError(
            422, "post_incomplete", f"Write the post body in the default locale ({default_locale()}) before publishing"
        )
    if post.status == PostStatus.PUBLISHED:
        return False
    post.status = PostStatus.PUBLISHED
    if post.published_at is None:
        post.published_at = now
    db.flush()
    return True


def unpublish_post(db: Session, post: BlogPost) -> bool:
    """Back to draft (published_at is kept so re-publishing restores the original date)."""
    if post.status == PostStatus.DRAFT:
        return False
    post.status = PostStatus.DRAFT
    db.flush()
    return True


def delete_post(db: Session, post: BlogPost) -> None:
    db.delete(post)
    db.flush()
