"""Admin authentication, account self-service, admin user management and audit-log queries.

Functions add/flush changes but never commit: routers commit the request's transaction. Functions
that record a failed login attempt and then raise expect the router to commit that record before
re-raising (see ``app.admin_auth.router``).
"""

from __future__ import annotations

import functools
import hmac
import math
import secrets
import threading
import unicodedata
from datetime import datetime, timedelta
from typing import Any, NoReturn, cast

import pyotp
from sqlalchemy import ColumnElement, CursorResult, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.admin_auth.schemas import AuditLogQuery, UserCreateIn, UserUpdateIn
from app.errors import ApiError, not_found
from app.models import AdminRole, AdminSession, AdminUser, AuditLog, LoginAttempt
from app.security import hash_password, hash_token, password_needs_rehash, verify_password
from app.utils import utcnow

LOGIN_WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_EMAIL = 5
MAX_FAILURES_PER_IP = 30

TOTP_ISSUER = "Zodiac Blend"
TOTP_DIGITS = 6
TOTP_VALID_WINDOW = 1  # also accept the previous/next 30 s step (clock drift, typing time)

USER_ENTITY = "admin_user"
_INVALID_CREDENTIALS_MESSAGE = "Invalid email or password"


# ---------------------------------------------------------------------------
# Login throttling
# ---------------------------------------------------------------------------


def _nth_latest_failure(db: Session, condition: ColumnElement[bool], since: Any, n: int) -> datetime | None:
    """Timestamp of the n-th most recent failure after ``since``; ``None`` if there are fewer than n."""
    stmt = (
        select(LoginAttempt.created_at)
        .where(condition, LoginAttempt.success.is_(False), LoginAttempt.created_at > since)
        .order_by(LoginAttempt.created_at.desc())
        .offset(n - 1)
        .limit(1)
    )
    return db.scalar(stmt)


def check_login_throttle(db: Session, email: str, ip: str | None, now: datetime) -> None:
    """Raise 429 ``rate_limited`` when the email or the IP has too many recent failures.

    Email failures only count since that email's last successful login, so a legitimate user who
    finally gets in starts from a clean slate. Runs before any password check.
    """
    window_start = now - LOGIN_WINDOW
    last_success = (
        select(func.max(LoginAttempt.created_at))
        .where(LoginAttempt.email == email, LoginAttempt.success.is_(True))
        .scalar_subquery()
    )
    email_since = func.greatest(window_start, func.coalesce(last_success, window_start))
    oldest_blocking = [_nth_latest_failure(db, LoginAttempt.email == email, email_since, MAX_FAILURES_PER_EMAIL)]
    if ip:
        oldest_blocking.append(_nth_latest_failure(db, LoginAttempt.ip == ip, window_start, MAX_FAILURES_PER_IP))
    blocking = [ts for ts in oldest_blocking if ts is not None]
    if not blocking:
        return
    retry_after = max(1, math.ceil((max(blocking) + LOGIN_WINDOW - now).total_seconds()))
    raise ApiError(
        429,
        "rate_limited",
        "Too many failed login attempts, please try again later.",
        {"retry_after_seconds": retry_after},
        headers={"Retry-After": str(retry_after)},
    )


def record_login_attempt(db: Session, email: str, ip: str | None, *, success: bool, now: datetime) -> None:
    db.add(LoginAttempt(email=email[:320], ip=ip, success=success, created_at=now))
    db.flush()


def _record_failure_and_raise(db: Session, email: str, ip: str | None, now: datetime, error: ApiError) -> NoReturn:
    record_login_attempt(db, email, ip, success=False, now=now)
    raise error


# ---------------------------------------------------------------------------
# TOTP
# ---------------------------------------------------------------------------


class _TotpReplayGuard:
    """Remembers the last accepted time step per user so a code cannot be reused within its window.

    In-process only: with several API processes a replay is still bounded by the ~90 s validity window.
    Keyed by a fingerprint of the secret as well, so re-enrolment (or a reused user id) starts fresh.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_step: dict[int, tuple[str, int]] = {}

    def accept(self, user_id: int, secret: str, step: int) -> bool:
        fingerprint = hash_token(secret)
        with self._lock:
            previous = self._last_step.get(user_id)
            if previous is not None and previous[0] == fingerprint and step <= previous[1]:
                return False
            self._last_step[user_id] = (fingerprint, step)
            return True


_replay_guard = _TotpReplayGuard()


def _is_blank(code: str | None) -> bool:
    return code is None or not code.strip()


def _clean_totp_code(code: str) -> str | None:
    """Digits only (spaces/dashes ignored, any Unicode decimal digit such as ١٢٣ accepted) or None."""
    digits: list[str] = []
    for char in code:
        if char in " -":
            continue
        value = unicodedata.decimal(char, None)
        if value is None:
            return None
        digits.append(str(value))
    cleaned = "".join(digits)
    return cleaned if len(cleaned) == TOTP_DIGITS else None


def _matching_totp_step(secret: str, code: str, now: datetime) -> int | None:
    totp = pyotp.TOTP(secret, digits=TOTP_DIGITS)
    current = totp.timecode(now)
    matched: int | None = None
    # Check every candidate step (no early exit) so timing does not reveal which step matched.
    for step in range(current - TOTP_VALID_WINDOW, current + TOTP_VALID_WINDOW + 1):
        if hmac.compare_digest(totp.generate_otp(step), code):
            matched = step
    return matched


def verify_totp(user_id: int, secret: str, code: str | None, now: datetime | None = None) -> bool:
    """Check a TOTP code (±1 step) and consume it so the same code cannot be replayed."""
    if code is None:
        return False
    cleaned = _clean_totp_code(code)
    if cleaned is None:
        return False
    step = _matching_totp_step(secret, cleaned, now or utcnow())
    return step is not None and _replay_guard.accept(user_id, secret, step)


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


def revoke_user_sessions(db: Session, user_id: int, *, keep_session_id: int | None = None) -> int:
    """Delete a user's sessions (optionally keeping one); returns how many were removed."""
    stmt = delete(AdminSession).where(AdminSession.user_id == user_id)
    if keep_session_id is not None:
        stmt = stmt.where(AdminSession.id != keep_session_id)
    result = cast(CursorResult[Any], db.execute(stmt))
    return result.rowcount or 0


def revoke_session_token(db: Session, token: str | None) -> None:
    """Drop the session a (possibly stale) cookie points to, e.g. before issuing a new one at login."""
    if token:
        db.execute(delete(AdminSession).where(AdminSession.token_hash == hash_token(token)))


# ---------------------------------------------------------------------------
# Login & account self-service
# ---------------------------------------------------------------------------


@functools.cache
def _dummy_password_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def _invalid_field(code: str, field: str, message: str) -> ApiError:
    return ApiError(422, code, message, {"fields": [{"field": field, "message": message, "type": code}]})


def authenticate(db: Session, *, email: str, password: str, totp_code: str | None, ip: str | None) -> AdminUser:
    """Verify credentials (+ TOTP when enrolled) for a normalised email; records the attempt.

    Raises 429 ``rate_limited``, 401 ``invalid_credentials``, 401 ``mfa_required`` (not counted as a
    failure: it is the normal first step for MFA users) or 401 ``invalid_mfa_code``.
    """
    now = utcnow()
    check_login_throttle(db, email, ip, now)
    user = db.scalar(select(AdminUser).where(AdminUser.email == email))
    # Always run one argon2 verification so response time does not reveal whether the email exists.
    password_ok = verify_password(password, user.password_hash if user else _dummy_password_hash())
    if user is None or not password_ok or not user.is_active:
        _record_failure_and_raise(
            db, email, ip, now, ApiError(401, "invalid_credentials", _INVALID_CREDENTIALS_MESSAGE)
        )
    if user.totp_secret:
        if _is_blank(totp_code):
            raise ApiError(401, "mfa_required", "Enter the code from your authenticator app")
        if not verify_totp(user.id, user.totp_secret, totp_code, now):
            _record_failure_and_raise(db, email, ip, now, ApiError(401, "invalid_mfa_code", "Invalid MFA code"))
    record_login_attempt(db, email, ip, success=True, now=now)
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = now
    db.flush()
    return user


def change_password(
    db: Session, session: AdminSession, *, current_password: str, new_password: str, ip: str | None
) -> int:
    """Change the session user's password and revoke their other sessions (returns how many)."""
    user = session.user
    now = utcnow()
    # A stolen session must not become an unlimited password-guessing oracle.
    check_login_throttle(db, user.email, ip, now)
    if not verify_password(current_password, user.password_hash):
        error = _invalid_field("invalid_password", "current_password", "Current password is incorrect")
        _record_failure_and_raise(db, user.email, ip, now, error)
    user.password_hash = hash_password(new_password)
    revoked = revoke_user_sessions(db, user.id, keep_session_id=session.id)
    audit.record(db, user, "auth.password_change", USER_ENTITY, user.id, {"other_sessions_revoked": revoked}, ip=ip)
    db.flush()
    return revoked


def start_mfa_setup(db: Session, user: AdminUser) -> tuple[str, str]:
    """Generate a pending TOTP secret; returns ``(secret, otpauth_url)``."""
    if user.totp_secret:
        raise ApiError(409, "mfa_already_enabled", "MFA is already enabled; disable it first to re-enrol")
    secret = pyotp.random_base32()
    user.totp_pending_secret = secret
    db.flush()
    otpauth_url = pyotp.TOTP(secret, digits=TOTP_DIGITS).provisioning_uri(name=user.email, issuer_name=TOTP_ISSUER)
    return secret, otpauth_url


def enable_mfa(db: Session, user: AdminUser, *, code: str, ip: str | None) -> None:
    if user.totp_secret:
        raise ApiError(409, "mfa_already_enabled", "MFA is already enabled")
    if not user.totp_pending_secret:
        raise ApiError(409, "mfa_setup_required", "Start MFA setup first")
    if not verify_totp(user.id, user.totp_pending_secret, code):
        raise _invalid_field("invalid_mfa_code", "code", "Invalid MFA code")
    user.totp_secret = user.totp_pending_secret
    user.totp_pending_secret = None
    audit.record(db, user, "auth.mfa_enable", USER_ENTITY, user.id, ip=ip)
    db.flush()


def disable_mfa(db: Session, user: AdminUser, *, password: str, code: str, ip: str | None) -> None:
    if not user.totp_secret:
        raise ApiError(409, "mfa_not_enabled", "MFA is not enabled")
    now = utcnow()
    check_login_throttle(db, user.email, ip, now)
    if not verify_password(password, user.password_hash):
        error = _invalid_field("invalid_password", "password", "Password is incorrect")
        _record_failure_and_raise(db, user.email, ip, now, error)
    if not verify_totp(user.id, user.totp_secret, code, now):
        _record_failure_and_raise(
            db, user.email, ip, now, _invalid_field("invalid_mfa_code", "code", "Invalid MFA code")
        )
    user.totp_secret = None
    user.totp_pending_secret = None
    audit.record(db, user, "auth.mfa_disable", USER_ENTITY, user.id, ip=ip)
    db.flush()


# ---------------------------------------------------------------------------
# Admin user management (owner)
# ---------------------------------------------------------------------------


def _email_taken() -> ApiError:
    return ApiError(409, "email_taken", "An admin user with this email already exists")


def _lock_active_owner_ids(db: Session) -> list[int]:
    """Lock active owner rows (in id order, so concurrent changes serialise without deadlocks)."""
    stmt = (
        select(AdminUser.id)
        .where(AdminUser.role == AdminRole.OWNER, AdminUser.is_active.is_(True))
        .order_by(AdminUser.id)
        .with_for_update()
    )
    return list(db.scalars(stmt))


def _get_user_for_update(db: Session, user_id: int) -> AdminUser:
    stmt = select(AdminUser).where(AdminUser.id == user_id).with_for_update().execution_options(populate_existing=True)
    user = db.scalar(stmt)
    if user is None:
        raise not_found("admin user")
    return user


def _ensure_owner_remains(user: AdminUser, new_role: AdminRole, new_active: bool, active_owner_ids: list[int]) -> None:
    stays_active_owner = new_role == AdminRole.OWNER and new_active
    if user.role != AdminRole.OWNER or not user.is_active or stays_active_owner:
        return
    if not any(owner_id != user.id for owner_id in active_owner_ids):
        raise ApiError(409, "last_owner", "At least one active owner must remain")


def list_users(db: Session, *, page: int, page_size: int) -> tuple[list[AdminUser], int]:
    total = db.scalar(select(func.count()).select_from(AdminUser)) or 0
    stmt = select(AdminUser).order_by(AdminUser.id).offset((page - 1) * page_size).limit(page_size)
    return list(db.scalars(stmt)), total


def create_user(db: Session, actor: AdminUser, data: UserCreateIn, *, ip: str | None) -> AdminUser:
    if db.scalar(select(AdminUser.id).where(AdminUser.email == data.email)) is not None:
        raise _email_taken()
    user = AdminUser(
        email=data.email,
        name=data.name,
        role=data.role,
        password_hash=hash_password(data.password),
        is_active=True,
    )
    try:
        with db.begin_nested():  # a concurrent insert of the same email only rolls back this savepoint
            db.add(user)
            db.flush()
    except IntegrityError as exc:
        raise _email_taken() from exc
    audit.record(
        db,
        actor,
        "user.create",
        USER_ENTITY,
        user.id,
        {"email": user.email, "name": user.name, "role": user.role.value},
        ip=ip,
    )
    db.flush()
    return user


def update_user(db: Session, actor: AdminUser, user_id: int, changes: UserUpdateIn, *, ip: str | None) -> AdminUser:
    """Apply a partial update. Owners change their own password/MFA via /auth (which re-checks secrets)."""
    if user_id == actor.id and (changes.password is not None or changes.reset_mfa):
        raise ApiError(
            403, "self_change_forbidden", "Change your own password or MFA from your account settings instead"
        )
    touches_ownership = changes.role is not None or changes.is_active is not None
    active_owner_ids = _lock_active_owner_ids(db) if touches_ownership else []
    user = _get_user_for_update(db, user_id)
    new_role = changes.role if changes.role is not None else user.role
    new_active = changes.is_active if changes.is_active is not None else user.is_active
    _ensure_owner_remains(user, new_role, new_active, active_owner_ids)

    diff: dict[str, dict[str, Any]] = {}
    if changes.name is not None and changes.name != user.name:
        diff["name"] = {"from": user.name, "to": changes.name}
        user.name = changes.name
    if new_role != user.role:
        diff["role"] = {"from": user.role.value, "to": new_role.value}
        user.role = new_role
    if new_active != user.is_active:
        diff["is_active"] = {"from": user.is_active, "to": new_active}
        user.is_active = new_active
    password_reset = changes.password is not None
    if changes.password is not None:
        user.password_hash = hash_password(changes.password)
    mfa_reset = changes.reset_mfa and (user.totp_secret is not None or user.totp_pending_secret is not None)
    if mfa_reset:
        user.totp_secret = None
        user.totp_pending_secret = None

    if not (diff or password_reset or mfa_reset):
        return user
    sessions_revoked = 0
    if password_reset or mfa_reset or not user.is_active:
        sessions_revoked = revoke_user_sessions(db, user.id)
    audit_data = {
        "changes": diff,
        "password_reset": password_reset,
        "mfa_reset": mfa_reset,
        "sessions_revoked": sessions_revoked,
    }
    audit.record(db, actor, "user.update", USER_ENTITY, user.id, audit_data, ip=ip)
    db.flush()
    return user


def deactivate_user(db: Session, actor: AdminUser, user_id: int, *, ip: str | None) -> AdminUser:
    active_owner_ids = _lock_active_owner_ids(db)
    user = _get_user_for_update(db, user_id)
    if not user.is_active:
        return user
    _ensure_owner_remains(user, user.role, False, active_owner_ids)
    user.is_active = False
    sessions_revoked = revoke_user_sessions(db, user.id)
    audit.record(db, actor, "user.deactivate", USER_ENTITY, user.id, {"sessions_revoked": sessions_revoked}, ip=ip)
    db.flush()
    return user


# ---------------------------------------------------------------------------
# Audit log (manager)
# ---------------------------------------------------------------------------


def list_audit_logs(db: Session, query: AuditLogQuery) -> tuple[list[tuple[AuditLog, str | None]], int]:
    """Newest first, with the acting admin's email (``None`` for system entries or deleted users)."""
    conditions: list[ColumnElement[bool]] = []
    if query.entity_type is not None:
        conditions.append(AuditLog.entity_type == query.entity_type)
    if query.action is not None:
        conditions.append(AuditLog.action == query.action)
    if query.user_id is not None:
        conditions.append(AuditLog.user_id == query.user_id)
    total = db.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    stmt = (
        select(AuditLog, AdminUser.email)
        .outerjoin(AdminUser, AdminUser.id == AuditLog.user_id)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )
    rows = db.execute(stmt).all()
    return [(entry, email) for entry, email in rows], total
