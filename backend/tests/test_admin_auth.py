"""Admin auth: login + throttling, logout/me, password change, MFA enrolment and sessions."""

from __future__ import annotations

import time
from collections.abc import Iterator
from datetime import timedelta

import pyotp
import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.admin_auth import service
from app.admin_auth.deps import create_session
from app.config import get_settings
from app.models import AdminSession, AdminUser, AuditLog, LoginAttempt
from app.security import verify_password
from app.utils import utcnow

AUTH = "/api/v1/admin/auth"
HDR = {"X-ZB-Admin": "1"}
PASSWORD = "correct horse battery"
NEW_PASSWORD = "a brand new passphrase"
TEST_CLIENT_IP = "testclient"


def login(client: TestClient, email: str, password: str = PASSWORD, totp_code: str | None = None, **kwargs):
    body = {"email": email, "password": password}
    if totp_code is not None:
        body["totp_code"] = totp_code
    headers = kwargs.pop("headers", HDR)
    return client.post(f"{AUTH}/login", json=body, headers=headers, **kwargs)


def error_code(response) -> str:
    return response.json()["error"]["code"]


def add_attempts(db: Session, count: int, *, email: str, ip: str = TEST_CLIENT_IP, success: bool = False, age=None):
    created = utcnow() - (age or timedelta(minutes=1))
    db.add_all([LoginAttempt(email=email, ip=ip, success=success, created_at=created) for _ in range(count)])
    db.commit()


def attempts(db: Session, email: str, success: bool) -> int:
    stmt = select(func.count()).select_from(LoginAttempt).where(LoginAttempt.email == email)
    return db.scalar(stmt.where(LoginAttempt.success.is_(success)))


def session_count(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(AdminSession).where(AdminSession.user_id == user_id))


def audit_actions(db: Session) -> list[AuditLog]:
    db.expire_all()
    return list(db.scalars(select(AuditLog).order_by(AuditLog.id)))


def wrong_code(totp: pyotp.TOTP) -> str:
    """A well-formed code that is not valid for any step inside the verification window."""
    now = time.time()
    valid = {totp.at(now + offset) for offset in (-30, 0, 30)}
    return next(c for c in ("000000", "111111", "222222", "333333") if c not in valid)


def enable_totp(db: Session, user: AdminUser) -> pyotp.TOTP:
    user.totp_secret = pyotp.random_base32()
    db.commit()
    return pyotp.TOTP(user.totp_secret)


@pytest.fixture
def session_client(db: Session) -> Iterator:
    """Factory: an independent TestClient logged in as ``user`` (own cookie jar, CSRF header set)."""
    from app.main import app

    clients: list[TestClient] = []

    def _make(user: AdminUser) -> TestClient:
        token = create_session(db, user)
        db.commit()
        c = TestClient(app)
        c.cookies.set(get_settings().admin_session_cookie, token)
        c.headers.update(HDR)
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.close()


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


def test_login_success_returns_user_and_sets_session_cookie(client, db, make_admin):
    user = make_admin("admin", email="boss@example.com")

    r = login(client, "  BOSS@Example.com ")

    assert r.status_code == 200
    body = r.json()["user"]
    assert body["id"] == user.id
    assert body["email"] == "boss@example.com"
    assert body["role"] == "admin"
    assert body["mfa_enabled"] is False
    assert body["last_login_at"] is not None
    assert set(body) == {"id", "email", "name", "role", "mfa_enabled", "last_login_at"}
    set_cookie = r.headers["set-cookie"].lower()
    assert set_cookie.startswith(f"{get_settings().admin_session_cookie}=")
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie
    assert r.headers["cache-control"] == "no-store"

    me = client.get(f"{AUTH}/me")
    assert me.status_code == 200
    assert me.json()["user"]["id"] == user.id
    db.refresh(user)
    assert user.last_login_at is not None
    assert attempts(db, "boss@example.com", success=True) == 1
    assert session_count(db, user.id) == 1


def test_login_requires_admin_header(client, db, make_admin):
    make_admin("owner", email="o@example.com")

    r = login(client, "o@example.com", headers={})

    assert r.status_code == 403
    assert error_code(r) == "csrf_failed"
    assert "set-cookie" not in r.headers
    assert attempts(db, "o@example.com", success=False) == 0


def test_login_rejects_wrong_password_unknown_email_and_inactive_user_identically(client, db, make_admin):
    make_admin("editor", email="e@example.com")
    inactive = make_admin("editor", email="gone@example.com")
    inactive.is_active = False
    db.commit()

    responses = [
        login(client, "e@example.com", "wrong password!!"),
        login(client, "nobody@example.com"),
        login(client, "gone@example.com"),
    ]

    for r in responses:
        assert r.status_code == 401
        assert r.json()["error"] == {
            "code": "invalid_credentials",
            "message": "Invalid email or password",
            "details": {},
        }
        assert "set-cookie" not in r.headers
    for email in ("e@example.com", "nobody@example.com", "gone@example.com"):
        assert attempts(db, email, success=False) == 1


def test_login_unknown_email_still_runs_a_password_hash_check(client, monkeypatch):
    calls: list[str] = []

    def spy(password: str, password_hash: str) -> bool:
        calls.append(password_hash)
        return verify_password(password, password_hash)

    monkeypatch.setattr(service, "verify_password", spy)

    r = login(client, "ghost@example.com")

    assert r.status_code == 401
    assert len(calls) == 1 and calls[0].startswith("$argon2")


def test_login_validation_errors(client):
    assert login(client, "", PASSWORD).status_code == 422
    r = client.post(f"{AUTH}/login", json={"email": "a@example.com"}, headers=HDR)
    assert r.status_code == 422
    assert error_code(r) == "validation_error"
    r = client.post(f"{AUTH}/login", json={"email": "a@example.com", "password": "x", "remember": True}, headers=HDR)
    assert r.status_code == 422
    assert login(client, "a@example.com", "x" * 1025).status_code == 422


def test_login_rehashes_outdated_password_hash(client, db, make_admin):
    user = make_admin("editor", email="old@example.com")
    weak = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)
    user.password_hash = weak.hash(PASSWORD)
    db.commit()
    old_hash = user.password_hash

    assert login(client, "old@example.com").status_code == 200

    db.refresh(user)
    assert user.password_hash != old_hash
    assert verify_password(PASSWORD, user.password_hash)
    assert not service.password_needs_rehash(user.password_hash)


def test_login_replaces_session_from_existing_cookie(client, db, make_admin):
    user = make_admin("editor", email="twice@example.com")

    assert login(client, "twice@example.com").status_code == 200
    assert login(client, "twice@example.com").status_code == 200

    assert session_count(db, user.id) == 1
    assert client.get(f"{AUTH}/me").status_code == 200


# ---------------------------------------------------------------------------
# Throttling
# ---------------------------------------------------------------------------


def test_five_failures_block_login_even_with_correct_password(client, db, make_admin):
    make_admin("owner", email="target@example.com")
    for _ in range(5):
        assert login(client, "target@example.com", "not the password").status_code == 401

    r = login(client, "target@example.com")

    assert r.status_code == 429
    assert error_code(r) == "rate_limited"
    retry_after = int(r.headers["retry-after"])
    assert 1 <= retry_after <= 900
    assert r.json()["error"]["details"]["retry_after_seconds"] == retry_after
    assert "set-cookie" not in r.headers


def test_throttle_is_checked_before_the_password(client, db, monkeypatch):
    add_attempts(db, 5, email="locked@example.com")
    monkeypatch.setattr(service, "verify_password", lambda *_: pytest.fail("password must not be checked"))

    r = login(client, "locked@example.com")

    assert r.status_code == 429
    assert attempts(db, "locked@example.com", success=False) == 5  # a blocked request is not recorded


def test_four_failures_do_not_block(client, db, make_admin):
    make_admin("owner", email="four@example.com")
    add_attempts(db, 4, email="four@example.com")

    assert login(client, "four@example.com").status_code == 200


def test_failures_older_than_the_window_are_ignored(client, db, make_admin):
    make_admin("owner", email="old-fail@example.com")
    add_attempts(db, 10, email="old-fail@example.com", age=timedelta(minutes=16))

    assert login(client, "old-fail@example.com").status_code == 200


def test_successful_login_resets_the_email_failure_count(client, db, make_admin):
    make_admin("owner", email="reset@example.com")
    add_attempts(db, 4, email="reset@example.com", age=timedelta(minutes=10))
    add_attempts(db, 1, email="reset@example.com", success=True, age=timedelta(minutes=5))
    add_attempts(db, 4, email="reset@example.com", age=timedelta(minutes=1))

    assert login(client, "reset@example.com").status_code == 200


def test_retry_after_reflects_when_the_block_lifts(client, db):
    add_attempts(db, 5, email="wait@example.com", age=timedelta(minutes=10))

    r = login(client, "wait@example.com")

    assert r.status_code == 429
    assert 290 <= int(r.headers["retry-after"]) <= 301


def test_thirty_failures_from_one_ip_block_any_email(client, db, make_admin):
    make_admin("owner", email="victim@example.com")
    for i in range(30):
        add_attempts(db, 1, email=f"spray{i}@example.com")

    r = login(client, "victim@example.com")

    assert r.status_code == 429
    assert error_code(r) == "rate_limited"


def test_failures_from_other_ips_do_not_count_for_this_ip(client, db, make_admin):
    make_admin("owner", email="fine@example.com")
    add_attempts(db, 40, email="spray@example.com", ip="203.0.113.9")

    assert login(client, "fine@example.com").status_code == 200


# ---------------------------------------------------------------------------
# Logout, me, sessions
# ---------------------------------------------------------------------------


def test_me_requires_a_session(client):
    r = client.get(f"{AUTH}/me")
    assert r.status_code == 401
    assert error_code(r) == "unauthorized"


def test_me_rejects_unknown_token(client):
    client.cookies.set(get_settings().admin_session_cookie, "forged-token")
    assert client.get(f"{AUTH}/me").status_code == 401


def test_logout_requires_csrf_header_then_invalidates_session(client, db, make_admin):
    user = make_admin("editor", email="bye@example.com")
    assert login(client, "bye@example.com").status_code == 200

    r = client.post(f"{AUTH}/logout")
    assert r.status_code == 403
    assert error_code(r) == "csrf_failed"
    assert client.get(f"{AUTH}/me").status_code == 200

    r = client.post(f"{AUTH}/logout", headers=HDR)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert session_count(db, user.id) == 0
    assert client.get(f"{AUTH}/me").status_code == 401


def test_logout_without_session_is_unauthorized(client):
    assert client.post(f"{AUTH}/logout", headers=HDR).status_code == 401


def test_expired_session_is_rejected(db, make_admin, session_client):
    user = make_admin("owner")
    c = session_client(user)
    db.execute(update(AdminSession).values(expires_at=utcnow() - timedelta(seconds=1)))
    db.commit()

    assert c.get(f"{AUTH}/me").status_code == 401


def test_deactivated_user_session_is_rejected(db, make_admin, session_client):
    user = make_admin("owner")
    c = session_client(user)
    assert c.get(f"{AUTH}/me").status_code == 200
    user.is_active = False
    db.commit()

    assert c.get(f"{AUTH}/me").status_code == 401


# ---------------------------------------------------------------------------
# Password change
# ---------------------------------------------------------------------------


def test_change_password_requires_csrf_header(db, make_admin, session_client):
    c = session_client(make_admin("editor"))
    del c.headers["X-ZB-Admin"]

    r = c.post(f"{AUTH}/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD})

    assert r.status_code == 403
    assert error_code(r) == "csrf_failed"


def test_change_password_revokes_other_sessions_and_keeps_current(client, db, make_admin, session_client):
    user = make_admin("admin", email="pw@example.com")
    other_device = session_client(user)
    assert login(client, "pw@example.com").status_code == 200

    r = client.post(f"{AUTH}/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD}, headers=HDR)

    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert client.get(f"{AUTH}/me").status_code == 200
    assert other_device.get(f"{AUTH}/me").status_code == 401
    assert session_count(db, user.id) == 1
    entries = [e for e in audit_actions(db) if e.action == "auth.password_change"]
    assert len(entries) == 1
    assert entries[0].user_id == user.id and entries[0].entity_id == str(user.id)
    assert entries[0].data == {"other_sessions_revoked": 1}
    assert PASSWORD not in str(entries[0].data) and NEW_PASSWORD not in str(entries[0].data)

    with TestClient(client.app) as fresh:
        assert login(fresh, "pw@example.com", PASSWORD).status_code == 401
        assert login(fresh, "pw@example.com", NEW_PASSWORD).status_code == 200


def test_change_password_with_wrong_current_password(db, make_admin, session_client):
    user = make_admin("admin", email="wrong-current@example.com")
    c = session_client(user)

    r = c.post(f"{AUTH}/password", json={"current_password": "not my password", "new_password": NEW_PASSWORD})

    assert r.status_code == 422
    assert error_code(r) == "invalid_password"
    assert r.json()["error"]["details"]["fields"][0]["field"] == "current_password"
    assert attempts(db, "wrong-current@example.com", success=False) == 1
    db.refresh(user)
    assert verify_password(PASSWORD, user.password_hash)


def test_change_password_is_throttled(db, make_admin, session_client):
    c = session_client(make_admin("admin", email="guess@example.com"))
    add_attempts(db, 5, email="guess@example.com")

    r = c.post(f"{AUTH}/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD})

    assert r.status_code == 429


@pytest.mark.parametrize(
    "new_password",
    ["short pass", "x" * 201, " " * 12, PASSWORD],
    ids=["too-short", "too-long", "blank", "unchanged"],
)
def test_change_password_policy(db, make_admin, session_client, new_password):
    c = session_client(make_admin("admin"))

    r = c.post(f"{AUTH}/password", json={"current_password": PASSWORD, "new_password": new_password})

    assert r.status_code == 422
    assert error_code(r) == "validation_error"
    assert r.json()["error"]["details"]["fields"][0]["field"] == "new_password"


# ---------------------------------------------------------------------------
# MFA
# ---------------------------------------------------------------------------


def test_mfa_full_enrolment_and_login_flow(client, db, make_admin):
    user = make_admin("owner", email="mfa@example.com")
    assert login(client, "mfa@example.com").status_code == 200

    r = client.post(f"{AUTH}/mfa/setup", headers=HDR)
    assert r.status_code == 200
    secret = r.json()["secret"]
    otpauth = r.json()["otpauth_url"]
    assert otpauth.startswith("otpauth://totp/")
    assert "issuer=Zodiac%20Blend" in otpauth and "mfa%40example.com" in otpauth
    assert client.get(f"{AUTH}/me").json()["user"]["mfa_enabled"] is False  # pending only

    totp = pyotp.TOTP(secret)
    wrong = wrong_code(totp)
    r = client.post(f"{AUTH}/mfa/enable", json={"code": wrong}, headers=HDR)
    assert r.status_code == 422
    assert error_code(r) == "invalid_mfa_code"

    enable_code = totp.now()
    r = client.post(f"{AUTH}/mfa/enable", json={"code": enable_code}, headers=HDR)
    assert r.status_code == 200
    assert r.json()["user"]["mfa_enabled"] is True
    db.refresh(user)
    assert user.totp_secret == secret and user.totp_pending_secret is None
    assert "auth.mfa_enable" in [e.action for e in audit_actions(db)]
    assert all(secret not in str(e.data) for e in audit_actions(db))

    assert client.post(f"{AUTH}/logout", headers=HDR).status_code == 200

    for _ in range(6):  # asking for the code is not a failure, so it never triggers throttling
        r = login(client, "mfa@example.com")
        assert r.status_code == 401
        assert error_code(r) == "mfa_required"
        assert "set-cookie" not in r.headers
    assert attempts(db, "mfa@example.com", success=False) == 0

    r = login(client, "mfa@example.com", totp_code=wrong)
    assert r.status_code == 401
    assert error_code(r) == "invalid_mfa_code"

    r = login(client, "mfa@example.com", totp_code=enable_code)  # replay of an already-used code
    assert r.status_code == 401
    assert error_code(r) == "invalid_mfa_code"
    assert attempts(db, "mfa@example.com", success=False) == 2

    r = login(client, "mfa@example.com", totp_code=totp.at(time.time() + 30))
    assert r.status_code == 200
    assert r.json()["user"]["mfa_enabled"] is True
    assert client.get(f"{AUTH}/me").status_code == 200


def test_mfa_wrong_password_never_reveals_mfa_step(client, db, make_admin):
    user = make_admin("owner", email="mfa2@example.com")
    enable_totp(db, user)

    r = login(client, "mfa2@example.com", "wrong password!!")

    assert r.status_code == 401
    assert error_code(r) == "invalid_credentials"


def test_mfa_code_failures_count_towards_throttling(client, db, make_admin):
    user = make_admin("owner", email="mfa3@example.com")
    totp = enable_totp(db, user)
    wrong = wrong_code(totp)
    for _ in range(5):
        assert login(client, "mfa3@example.com", totp_code=wrong).status_code == 401

    r = login(client, "mfa3@example.com", totp_code=totp.now())

    assert r.status_code == 429


ARABIC_INDIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


@pytest.mark.parametrize(
    "formatter",
    [lambda c: f"{c[:3]} {c[3:]}", lambda c: c.translate(ARABIC_INDIC_DIGITS)],
    ids=["spaced", "arabic-indic"],
)
def test_mfa_code_accepts_spaces_and_arabic_indic_digits(client, db, make_admin, formatter):
    user = make_admin("owner", email="mfa4@example.com")
    totp = enable_totp(db, user)

    r = login(client, "mfa4@example.com", totp_code=formatter(totp.now()))

    assert r.status_code == 200


@pytest.mark.parametrize("code", ["abcdef", "12345", "1234567", "12.456"])
def test_mfa_malformed_code_is_invalid(client, db, make_admin, code):
    user = make_admin("owner", email="mfa5@example.com")
    enable_totp(db, user)

    r = login(client, "mfa5@example.com", totp_code=code)

    assert r.status_code == 401
    assert error_code(r) == "invalid_mfa_code"


def test_mfa_setup_and_enable_preconditions(db, make_admin, session_client):
    user = make_admin("editor")
    c = session_client(user)

    r = c.post(f"{AUTH}/mfa/enable", json={"code": "123456"})
    assert r.status_code == 409
    assert error_code(r) == "mfa_setup_required"

    r = c.post(f"{AUTH}/mfa/disable", json={"password": PASSWORD, "code": "123456"})
    assert r.status_code == 409
    assert error_code(r) == "mfa_not_enabled"

    enable_totp(db, user)
    r = c.post(f"{AUTH}/mfa/setup")
    assert r.status_code == 409
    assert error_code(r) == "mfa_already_enabled"
    r = c.post(f"{AUTH}/mfa/enable", json={"code": "123456"})
    assert r.status_code == 409


def test_mfa_setup_again_replaces_pending_secret(db, make_admin, session_client):
    user = make_admin("editor")
    c = session_client(user)

    first = c.post(f"{AUTH}/mfa/setup").json()["secret"]
    second = c.post(f"{AUTH}/mfa/setup").json()["secret"]

    assert first != second
    r = c.post(f"{AUTH}/mfa/enable", json={"code": pyotp.TOTP(first).now()})
    assert r.status_code == 422
    assert c.post(f"{AUTH}/mfa/enable", json={"code": pyotp.TOTP(second).now()}).status_code == 200


def test_mfa_endpoints_require_csrf_header(db, make_admin, session_client):
    c = session_client(make_admin("editor"))
    del c.headers["X-ZB-Admin"]

    assert c.post(f"{AUTH}/mfa/setup").status_code == 403
    assert c.post(f"{AUTH}/mfa/enable", json={"code": "123456"}).status_code == 403
    assert c.post(f"{AUTH}/mfa/disable", json={"password": PASSWORD, "code": "123456"}).status_code == 403


def test_mfa_disable_requires_password_and_code(client, db, make_admin, session_client):
    user = make_admin("admin", email="off@example.com")
    totp = enable_totp(db, user)
    c = session_client(user)

    r = c.post(f"{AUTH}/mfa/disable", json={"password": "wrong password!!", "code": totp.now()})
    assert r.status_code == 422
    assert error_code(r) == "invalid_password"

    wrong = wrong_code(totp)
    r = c.post(f"{AUTH}/mfa/disable", json={"password": PASSWORD, "code": wrong})
    assert r.status_code == 422
    assert error_code(r) == "invalid_mfa_code"
    assert attempts(db, "off@example.com", success=False) == 2

    r = c.post(f"{AUTH}/mfa/disable", json={"password": PASSWORD, "code": totp.now()})
    assert r.status_code == 200
    assert r.json()["user"]["mfa_enabled"] is False
    db.refresh(user)
    assert user.totp_secret is None
    assert "auth.mfa_disable" in [e.action for e in audit_actions(db)]

    assert login(client, "off@example.com").status_code == 200  # no code needed any more


def test_totp_replay_guard_is_per_secret():
    secret_a, secret_b = pyotp.random_base32(), pyotp.random_base32()
    now = utcnow()
    code_a = pyotp.TOTP(secret_a).at(now)
    code_b = pyotp.TOTP(secret_b).at(now)

    assert service.verify_totp(1, secret_a, code_a, now) is True
    assert service.verify_totp(1, secret_a, code_a, now) is False
    assert service.verify_totp(1, secret_b, code_b, now) is True  # re-enrolment with a new secret
    assert service.verify_totp(1, secret_a, None, now) is False
