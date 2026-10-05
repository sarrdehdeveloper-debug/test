"""Admin auth API (mounted at ``/api/v1/admin/auth``): login, logout, me, password and MFA."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.admin_auth import service
from app.admin_auth.deps import (
    CSRF_HEADER,
    clear_session_cookie,
    create_session,
    get_current_admin,
    get_current_session,
    set_session_cookie,
)
from app.admin_auth.schemas import (
    AdminUserOut,
    LoginIn,
    MfaDisableIn,
    MfaEnableIn,
    MfaSetupOut,
    OkOut,
    PasswordChangeIn,
    UserEnvelopeOut,
)
from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.models import AdminSession, AdminUser
from app.utils import client_ip

router = APIRouter()


def require_admin_header(request: Request) -> None:
    """Login has no session yet, so deps' CSRF check does not run; demand the header here too.

    This blocks cross-site "login CSRF" (logging a victim's browser into an attacker's account).
    """
    if request.headers.get(CSRF_HEADER) != "1":
        raise ApiError(403, "csrf_failed", "Missing admin request header")


@router.post("/login", dependencies=[Depends(require_admin_header)])
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> UserEnvelopeOut:
    try:
        user = service.authenticate(
            db, email=body.email, password=body.password, totp_code=body.totp_code, ip=client_ip(request)
        )
    except ApiError:
        db.commit()  # persist the failed-attempt record so throttling sees it
        raise
    service.revoke_session_token(db, request.cookies.get(get_settings().admin_session_cookie))
    token = create_session(db, user, request)
    db.commit()
    set_session_cookie(response, token)
    return UserEnvelopeOut(user=AdminUserOut.from_user(user))


@router.post("/logout")
def logout(
    response: Response, session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)
) -> OkOut:
    db.delete(session)
    db.commit()
    clear_session_cookie(response)
    return OkOut()


@router.get("/me")
def me(user: AdminUser = Depends(get_current_admin)) -> UserEnvelopeOut:
    return UserEnvelopeOut(user=AdminUserOut.from_user(user))


@router.post("/password")
def change_password(
    body: PasswordChangeIn,
    request: Request,
    session: AdminSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> OkOut:
    try:
        service.change_password(
            db,
            session,
            current_password=body.current_password,
            new_password=body.new_password,
            ip=client_ip(request),
        )
    except ApiError:
        db.commit()  # persist the failed-attempt record
        raise
    db.commit()
    return OkOut()


@router.post("/mfa/setup")
def mfa_setup(user: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)) -> MfaSetupOut:
    secret, otpauth_url = service.start_mfa_setup(db, user)
    db.commit()
    return MfaSetupOut(secret=secret, otpauth_url=otpauth_url)


@router.post("/mfa/enable")
def mfa_enable(
    body: MfaEnableIn,
    request: Request,
    user: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> UserEnvelopeOut:
    service.enable_mfa(db, user, code=body.code, ip=client_ip(request))
    db.commit()
    return UserEnvelopeOut(user=AdminUserOut.from_user(user))


@router.post("/mfa/disable")
def mfa_disable(
    body: MfaDisableIn,
    request: Request,
    user: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> UserEnvelopeOut:
    try:
        service.disable_mfa(db, user, password=body.password, code=body.code, ip=client_ip(request))
    except ApiError:
        db.commit()  # persist the failed-attempt record
        raise
    db.commit()
    return UserEnvelopeOut(user=AdminUserOut.from_user(user))
