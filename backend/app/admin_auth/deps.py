"""Admin authentication dependencies and session primitives.

Sessions: random token in an httpOnly cookie; only its SHA-256 is stored.
CSRF: state-changing admin requests must carry ``X-ZB-Admin: 1`` (a custom header cannot be
sent cross-site without a CORS preflight, which the API never grants) in addition to the
SameSite=Lax cookie.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.models import AdminRole, AdminSession, AdminUser
from app.security import hash_token, new_token
from app.utils import client_ip, utcnow

CSRF_HEADER = "x-zb-admin"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def create_session(db: Session, user: AdminUser, request: Request | None = None) -> str:
    """Create a session row and return the raw token (caller commits and sets the cookie)."""
    settings = get_settings()
    token = new_token(32)
    db.add(
        AdminSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=utcnow() + timedelta(hours=settings.admin_session_hours),
            ip=client_ip(request) if request else None,
            user_agent=(request.headers.get("user-agent", "")[:400] if request else None),
        )
    )
    db.flush()
    return token


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.admin_session_cookie,
        token,
        max_age=settings.admin_session_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.admin_session_cookie, path="/")


def _session_from_request(request: Request, db: Session) -> AdminSession | None:
    token = request.cookies.get(get_settings().admin_session_cookie)
    if not token:
        return None
    session = db.scalar(select(AdminSession).where(AdminSession.token_hash == hash_token(token)))
    if session is None or session.expires_at <= utcnow():
        return None
    if not session.user.is_active:
        return None
    return session


def get_current_session(request: Request, db: Session = Depends(get_db)) -> AdminSession:
    session = _session_from_request(request, db)
    if session is None:
        raise ApiError(401, "unauthorized", "Login required")
    if request.method not in _SAFE_METHODS and request.headers.get(CSRF_HEADER) != "1":
        raise ApiError(403, "csrf_failed", "Missing admin request header")
    return session


def get_current_admin(session: AdminSession = Depends(get_current_session)) -> AdminUser:
    return session.user


def require_roles(*roles: AdminRole) -> Callable[..., AdminUser]:
    """Dependency factory: ``Depends(require_roles(AdminRole.OWNER, AdminRole.ADMIN))``."""
    allowed = set(roles)

    def _dep(user: AdminUser = Depends(get_current_admin)) -> AdminUser:
        if user.role not in allowed:
            raise ApiError(403, "forbidden", "Insufficient role")
        return user

    return _dep


# Common role sets
ANY_ADMIN = (AdminRole.OWNER, AdminRole.ADMIN, AdminRole.EDITOR)
MANAGERS = (AdminRole.OWNER, AdminRole.ADMIN)
require_editor = require_roles(*ANY_ADMIN)  # content: blog, library, offers, site content, media
require_manager = require_roles(*MANAGERS)  # prompts, discounts, orders, settings, audit
require_owner = require_roles(AdminRole.OWNER)  # admin users
