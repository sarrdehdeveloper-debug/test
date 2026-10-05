"""Admin user management (owner only) and the audit log API (managers)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.admin_auth.deps import create_session
from app.config import get_settings
from app.models import AdminSession, AdminUser, AuditLog
from app.security import verify_password
from app.utils import utcnow

API = "/api/v1/admin"
AUTH = f"{API}/auth"
HDR = {"X-ZB-Admin": "1"}
PASSWORD = "correct horse battery"
NEW_PASSWORD = "another strong passphrase"


def error_code(response) -> str:
    return response.json()["error"]["code"]


def current_user(db: Session, client: TestClient) -> AdminUser:
    user_id = client.get(f"{AUTH}/me").json()["user"]["id"]
    return db.get(AdminUser, user_id)


def session_count(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(AdminSession).where(AdminSession.user_id == user_id))


def audit_entries(db: Session, action: str | None = None) -> list[AuditLog]:
    db.expire_all()
    stmt = select(AuditLog).order_by(AuditLog.id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    return list(db.scalars(stmt))


def new_user_body(**overrides) -> dict:
    body = {"email": "new.admin@example.com", "name": "New Admin", "role": "editor", "password": PASSWORD}
    body.update(overrides)
    return body


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


@pytest.fixture
def owner_client(admin_client) -> TestClient:
    return admin_client("owner")


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["admin", "editor"])
def test_non_owners_cannot_manage_users(db, make_admin, session_client, role):
    c = session_client(make_admin(role))
    target = make_admin("editor")

    responses = [
        c.get(f"{API}/users"),
        c.post(f"{API}/users", json=new_user_body()),
        c.patch(f"{API}/users/{target.id}", json={"name": "Hacked"}),
        c.delete(f"{API}/users/{target.id}"),
    ]

    for r in responses:
        assert r.status_code == 403
        assert error_code(r) == "forbidden"
    db.refresh(target)
    assert target.name == "Editor" and target.is_active


def test_user_endpoints_require_a_session(client):
    assert client.get(f"{API}/users").status_code == 401
    assert client.post(f"{API}/users", json=new_user_body(), headers=HDR).status_code == 401


def test_user_mutations_require_csrf_header(db, owner_client):
    target_id = owner_client.post(f"{API}/users", json=new_user_body()).json()["id"]
    del owner_client.headers["X-ZB-Admin"]

    assert owner_client.post(f"{API}/users", json=new_user_body(email="x@example.com")).status_code == 403
    assert owner_client.patch(f"{API}/users/{target_id}", json={"name": "X"}).status_code == 403
    assert owner_client.delete(f"{API}/users/{target_id}").status_code == 403
    assert owner_client.get(f"{API}/users").status_code == 200


# ---------------------------------------------------------------------------
# List & create
# ---------------------------------------------------------------------------


def test_list_users_paginates(db, make_admin, owner_client):
    for _ in range(3):
        make_admin("editor")

    r = owner_client.get(f"{API}/users", params={"page": 2, "page_size": 3})

    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 4 and body["page"] == 2 and body["page_size"] == 3
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert set(item) == {
        "id",
        "email",
        "name",
        "role",
        "mfa_enabled",
        "last_login_at",
        "is_active",
        "created_at",
        "updated_at",
    }
    assert "password_hash" not in str(body) and "totp" not in str(body)
    assert owner_client.get(f"{API}/users", params={"page_size": 101}).status_code == 422
    assert owner_client.get(f"{API}/users", params={"page": 0}).status_code == 422


def test_create_user_and_new_user_can_log_in(client, db, owner_client):
    owner = current_user(db, owner_client)

    r = owner_client.post(f"{API}/users", json=new_user_body(email="  New.Admin@Example.COM ", role="admin"))

    assert r.status_code == 201
    created = r.json()
    assert created["email"] == "new.admin@example.com"
    assert created["role"] == "admin" and created["is_active"] is True and created["mfa_enabled"] is False
    user = db.get(AdminUser, created["id"])
    assert verify_password(PASSWORD, user.password_hash)

    [entry] = audit_entries(db, "user.create")
    assert entry.user_id == owner.id and entry.entity_type == "admin_user" and entry.entity_id == str(user.id)
    assert entry.data == {"email": "new.admin@example.com", "name": "New Admin", "role": "admin"}
    assert entry.ip

    with TestClient(client.app) as fresh:
        r = fresh.post(f"{AUTH}/login", json={"email": "new.admin@example.com", "password": PASSWORD}, headers=HDR)
        assert r.status_code == 200


def test_create_user_rejects_duplicate_email_case_insensitively(db, make_admin, owner_client):
    make_admin("editor", email="taken@example.com")

    r = owner_client.post(f"{API}/users", json=new_user_body(email="TAKEN@example.com"))

    assert r.status_code == 409
    assert error_code(r) == "email_taken"
    assert audit_entries(db, "user.create") == []


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"email": "not-an-email"}, "email"),
        ({"password": "too short"}, "password"),
        ({"password": "y" * 201}, "password"),
        ({"password": " " * 14}, "password"),
        ({"role": "superuser"}, "role"),
        ({"name": "   "}, "name"),
        ({"is_active": False}, "is_active"),
    ],
    ids=["email", "short-password", "long-password", "blank-password", "role", "blank-name", "extra-field"],
)
def test_create_user_validation(owner_client, overrides, field):
    r = owner_client.post(f"{API}/users", json=new_user_body(**overrides))

    assert r.status_code == 422
    assert error_code(r) == "validation_error"
    assert [f["field"] for f in r.json()["error"]["details"]["fields"]] == [field]


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


def test_update_name_and_role_is_audited(db, make_admin, owner_client):
    target = make_admin("editor")

    r = owner_client.patch(f"{API}/users/{target.id}", json={"name": " Senior Editor ", "role": "admin"})

    assert r.status_code == 200
    assert r.json()["name"] == "Senior Editor" and r.json()["role"] == "admin"
    [entry] = audit_entries(db, "user.update")
    assert entry.entity_id == str(target.id)
    assert entry.data == {
        "changes": {
            "name": {"from": "Editor", "to": "Senior Editor"},
            "role": {"from": "editor", "to": "admin"},
        },
        "password_reset": False,
        "mfa_reset": False,
        "sessions_revoked": 0,
    }


def test_update_without_changes_is_not_audited(db, make_admin, owner_client):
    target = make_admin("editor")

    assert owner_client.patch(f"{API}/users/{target.id}", json={}).status_code == 200
    assert owner_client.patch(f"{API}/users/{target.id}", json={"role": "editor"}).status_code == 200
    assert audit_entries(db, "user.update") == []


@pytest.mark.parametrize("field", ["name", "role", "is_active", "password"])
def test_update_rejects_explicit_null(db, make_admin, owner_client, field):
    target = make_admin("editor")

    r = owner_client.patch(f"{API}/users/{target.id}", json={field: None})

    assert r.status_code == 422
    assert r.json()["error"]["details"]["fields"][0]["field"] == field


def test_update_rejects_unknown_fields_and_bad_ids(db, make_admin, owner_client):
    target = make_admin("editor")

    assert owner_client.patch(f"{API}/users/{target.id}", json={"email": "x@example.com"}).status_code == 422
    assert owner_client.patch(f"{API}/users/0", json={"name": "X"}).status_code == 422
    assert owner_client.patch(f"{API}/users/{2**63}", json={"name": "X"}).status_code == 422
    r = owner_client.patch(f"{API}/users/999999", json={"name": "X"})
    assert r.status_code == 404
    assert error_code(r) == "not_found"
    assert owner_client.delete(f"{API}/users/999999").status_code == 404


def test_password_reset_revokes_target_sessions(client, db, make_admin, owner_client, session_client):
    target = make_admin("editor", email="reset-me@example.com")
    target_client = session_client(target)
    assert target_client.get(f"{AUTH}/me").status_code == 200

    r = owner_client.patch(f"{API}/users/{target.id}", json={"password": NEW_PASSWORD})

    assert r.status_code == 200
    assert target_client.get(f"{AUTH}/me").status_code == 401
    assert session_count(db, target.id) == 0
    [entry] = audit_entries(db, "user.update")
    assert entry.data["password_reset"] is True and entry.data["sessions_revoked"] == 1
    assert NEW_PASSWORD not in str(entry.data)
    with TestClient(client.app) as fresh:
        login = {"email": "reset-me@example.com", "password": NEW_PASSWORD}
        assert fresh.post(f"{AUTH}/login", json=login, headers=HDR).status_code == 200


def test_owner_cannot_reset_own_password_or_mfa_via_user_management(db, owner_client):
    owner = current_user(db, owner_client)

    for body in ({"password": NEW_PASSWORD}, {"reset_mfa": True}):
        r = owner_client.patch(f"{API}/users/{owner.id}", json=body)
        assert r.status_code == 403
        assert error_code(r) == "self_change_forbidden"
    db.refresh(owner)
    assert verify_password(PASSWORD, owner.password_hash)


def test_reset_mfa_clears_enrolment_and_sessions(db, make_admin, owner_client, session_client):
    target = make_admin("admin")
    target.totp_secret = pyotp.random_base32()
    db.commit()
    target_client = session_client(target)

    r = owner_client.patch(f"{API}/users/{target.id}", json={"reset_mfa": True})

    assert r.status_code == 200
    assert r.json()["mfa_enabled"] is False
    db.refresh(target)
    assert target.totp_secret is None
    assert target_client.get(f"{AUTH}/me").status_code == 401
    [entry] = audit_entries(db, "user.update")
    assert entry.data["mfa_reset"] is True
    assert "totp" not in str(entry.data)


def test_deactivate_via_patch_and_reactivate(client, db, make_admin, owner_client, session_client):
    target = make_admin("editor", email="toggle@example.com")
    target_client = session_client(target)

    r = owner_client.patch(f"{API}/users/{target.id}", json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert target_client.get(f"{AUTH}/me").status_code == 401
    assert session_count(db, target.id) == 0

    r = owner_client.patch(f"{API}/users/{target.id}", json={"is_active": True})
    assert r.status_code == 200 and r.json()["is_active"] is True
    with TestClient(client.app) as fresh:
        login = {"email": "toggle@example.com", "password": PASSWORD}
        assert fresh.post(f"{AUTH}/login", json=login, headers=HDR).status_code == 200


# ---------------------------------------------------------------------------
# Delete (deactivate)
# ---------------------------------------------------------------------------


def test_delete_deactivates_user_and_revokes_sessions(client, db, make_admin, owner_client, session_client):
    target = make_admin("admin", email="leaver@example.com")
    target_client = session_client(target)

    r = owner_client.delete(f"{API}/users/{target.id}")

    assert r.status_code == 200
    assert r.json()["is_active"] is False
    db.refresh(target)
    assert target.is_active is False
    assert db.get(AdminUser, target.id) is not None  # kept for the audit trail
    assert target_client.get(f"{AUTH}/me").status_code == 401
    assert session_count(db, target.id) == 0
    [entry] = audit_entries(db, "user.deactivate")
    assert entry.entity_id == str(target.id) and entry.data == {"sessions_revoked": 1}

    with TestClient(client.app) as fresh:
        login = {"email": "leaver@example.com", "password": PASSWORD}
        r = fresh.post(f"{AUTH}/login", json=login, headers=HDR)
        assert r.status_code == 401
        assert error_code(r) == "invalid_credentials"

    assert owner_client.delete(f"{API}/users/{target.id}").status_code == 200  # idempotent
    assert len(audit_entries(db, "user.deactivate")) == 1


# ---------------------------------------------------------------------------
# Last-owner protection
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "body"),
    [("patch", {"role": "admin"}), ("patch", {"is_active": False}), ("delete", None)],
    ids=["demote", "deactivate", "delete"],
)
def test_last_active_owner_cannot_be_removed(db, make_admin, owner_client, method, body):
    owner = current_user(db, owner_client)
    inactive_owner = make_admin("owner")
    inactive_owner.is_active = False
    db.commit()

    kwargs = {"json": body} if body is not None else {}
    r = getattr(owner_client, method)(f"{API}/users/{owner.id}", **kwargs)

    assert r.status_code == 409
    assert error_code(r) == "last_owner"
    db.refresh(owner)
    assert owner.role == "owner" and owner.is_active
    assert owner_client.get(f"{API}/users").status_code == 200


def test_owner_can_step_down_when_another_owner_remains(db, make_admin, owner_client):
    owner = current_user(db, owner_client)
    make_admin("owner")

    r = owner_client.patch(f"{API}/users/{owner.id}", json={"role": "admin"})

    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    assert owner_client.get(f"{API}/users").status_code == 403  # no longer an owner


def test_owner_can_deactivate_self_when_another_owner_remains(db, make_admin, owner_client):
    owner = current_user(db, owner_client)
    make_admin("owner")

    r = owner_client.delete(f"{API}/users/{owner.id}")

    assert r.status_code == 200
    assert owner_client.get(f"{AUTH}/me").status_code == 401


def test_owner_can_demote_other_owner(db, make_admin, owner_client):
    other = make_admin("owner")

    r = owner_client.patch(f"{API}/users/{other.id}", json={"role": "editor"})

    assert r.status_code == 200 and r.json()["role"] == "editor"


def test_reactivating_or_promoting_does_not_trip_owner_guard(db, make_admin, owner_client):
    owner = current_user(db, owner_client)
    editor = make_admin("editor")

    assert owner_client.patch(f"{API}/users/{editor.id}", json={"role": "owner"}).status_code == 200
    assert owner_client.patch(f"{API}/users/{owner.id}", json={"role": "admin"}).status_code == 200


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


def _seed_audit(db: Session, actor: AdminUser) -> None:
    base = utcnow() - timedelta(hours=1)
    rows = [
        ("prompt.publish", "prompt_version", actor),
        ("discount.create", "discount_code", actor),
        ("settings.update", "settings", None),
    ]
    for minutes, (action, entity_type, user) in enumerate(rows):
        entry = audit.record(db, user, action, entity_type, minutes + 1, {"n": minutes})
        entry.created_at = base + timedelta(minutes=minutes)
    db.commit()


def test_audit_logs_newest_first_with_user_email(db, admin_client):
    c = admin_client("admin")
    manager = current_user(db, c)
    _seed_audit(db, manager)

    r = c.get(f"{API}/audit-logs")

    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3 and body["page"] == 1 and body["page_size"] == 20
    assert [i["action"] for i in body["items"]] == ["settings.update", "discount.create", "prompt.publish"]
    system, latest_by_user = body["items"][0], body["items"][1]
    assert system["user_id"] is None and system["user_email"] is None
    assert latest_by_user["user_id"] == manager.id and latest_by_user["user_email"] == manager.email
    assert latest_by_user["entity_type"] == "discount_code" and latest_by_user["entity_id"] == "2"
    assert latest_by_user["data"] == {"n": 1}


def test_audit_logs_filters_and_pagination(db, admin_client):
    c = admin_client("owner")
    actor = current_user(db, c)
    _seed_audit(db, actor)

    by_type = c.get(f"{API}/audit-logs", params={"entity_type": "discount_code"}).json()
    assert [i["action"] for i in by_type["items"]] == ["discount.create"] and by_type["total"] == 1

    by_user = c.get(f"{API}/audit-logs", params={"user_id": actor.id}).json()
    assert by_user["total"] == 2

    by_action = c.get(f"{API}/audit-logs", params={"action": "settings.update"}).json()
    assert by_action["total"] == 1

    page2 = c.get(f"{API}/audit-logs", params={"page": 2, "page_size": 2}).json()
    assert page2["total"] == 3 and [i["action"] for i in page2["items"]] == ["prompt.publish"]

    assert c.get(f"{API}/audit-logs", params={"page_size": 101}).status_code == 422
    assert c.get(f"{API}/audit-logs", params={"user_id": 0}).status_code == 422


def test_audit_logs_require_manager(db, admin_client):
    r = admin_client("editor").get(f"{API}/audit-logs")
    assert r.status_code == 403
    assert error_code(r) == "forbidden"


def test_audit_logs_require_session(client):
    assert client.get(f"{API}/audit-logs").status_code == 401


def test_user_management_actions_appear_in_audit_log(db, make_admin, owner_client):
    target = make_admin("editor")
    owner_client.patch(f"{API}/users/{target.id}", json={"role": "admin"})
    owner_client.delete(f"{API}/users/{target.id}")

    r = owner_client.get(f"{API}/audit-logs", params={"entity_type": "admin_user"})

    assert r.status_code == 200
    assert [i["action"] for i in r.json()["items"]] == ["user.deactivate", "user.update"]
    assert all(i["entity_id"] == str(target.id) for i in r.json()["items"])


def test_concurrent_owner_demotions_never_leave_zero_owners(make_admin):
    """Two owners demoting each other at once: the second transaction must see the first's result."""
    import threading

    from app.admin_auth import service
    from app.admin_auth.schemas import UserUpdateIn
    from app.db import SessionLocal
    from app.errors import ApiError
    from app.models import AdminRole

    owner_a, owner_b = make_admin("owner"), make_admin("owner")
    demote = UserUpdateIn(role=AdminRole.ADMIN)
    first, second = SessionLocal(), SessionLocal()
    outcome: dict[str, object] = {}

    def demote_a_as_b() -> None:
        try:
            service.update_user(second, second.get(AdminUser, owner_b.id), owner_a.id, demote, ip=None)
            second.commit()
            outcome["second"] = "ok"
        except ApiError as exc:
            second.rollback()
            outcome["second"] = exc.code

    try:
        service.update_user(first, first.get(AdminUser, owner_a.id), owner_b.id, demote, ip=None)
        worker = threading.Thread(target=demote_a_as_b)
        worker.start()
        worker.join(timeout=0.5)
        assert worker.is_alive(), "second demotion must wait for the owner-row lock"
        first.commit()
        worker.join(timeout=10)
        assert not worker.is_alive()
    finally:
        first.close()
        second.close()

    assert outcome["second"] == "last_owner"
    with SessionLocal() as check:
        owners = check.scalars(select(AdminUser).where(AdminUser.role == AdminRole.OWNER, AdminUser.is_active)).all()
        assert [o.id for o in owners] == [owner_a.id]
