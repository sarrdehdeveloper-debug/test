"""Test harness.

Each pytest process creates its own throw-away PostgreSQL database (so parallel test runs
never collide), builds the schema from ``app.models``, and truncates all tables after every
test. Application code commits normally — tests see real transactional behaviour.

Requires a PostgreSQL role allowed to CREATE DATABASE; configure with
``ZB_TEST_ADMIN_URL`` (default ``postgresql+psycopg://zodiac:zodiac@localhost:5432/postgres``).
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, text

_ADMIN_URL = os.environ.get("ZB_TEST_ADMIN_URL", "postgresql+psycopg://zodiac:zodiac@localhost:5432/postgres")
_DB_NAME = f"zb_test_{os.getpid()}_{uuid.uuid4().hex[:6]}"
_base = _ADMIN_URL.rsplit("/", 1)[0]

_admin_engine = create_engine(_ADMIN_URL, isolation_level="AUTOCOMMIT")
with _admin_engine.connect() as _conn:
    _conn.execute(text(f'CREATE DATABASE "{_DB_NAME}"'))

os.environ["ZB_DATABASE_URL"] = f"{_base}/{_DB_NAME}"
os.environ.setdefault("ZB_ENV", "test")
os.environ.setdefault("ZB_PAYMENT_PROVIDER", "fake")
os.environ.setdefault("ZB_AI_PROVIDER", "fake")
os.environ.setdefault("ZB_EMAIL_BACKEND", "console")
os.environ.setdefault("ZB_SITE_URL", "http://testserver")
if os.path.exists("/opt/pw-browsers/chromium-1194/chrome-linux/chrome"):
    os.environ.setdefault("ZB_CHROMIUM_EXECUTABLE", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

# Imports below must happen after the environment is configured.
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import models  # noqa: E402,F401
from app.config import get_settings  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

Base.metadata.create_all(engine)
_TABLES = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    with _admin_engine.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{_DB_NAME}" WITH (FORCE)'))
    _admin_engine.dispose()


@pytest.fixture(autouse=True)
def _clean_state(tmp_path, monkeypatch) -> Iterator[None]:
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_dir", tmp_path / "storage")
    limiter.reset()
    yield
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def make_admin(db: Session):
    """Factory: ``make_admin(role="owner", email=..., password=...) -> AdminUser``."""
    from app.models import AdminRole, AdminUser
    from app.security import hash_password

    def _make(role: str = "owner", email: str | None = None, password: str = "correct horse battery") -> AdminUser:
        user = AdminUser(
            email=(email or f"{role}-{uuid.uuid4().hex[:6]}@example.com").lower(),
            name=role.title(),
            role=AdminRole(role),
            password_hash=hash_password(password),
            is_active=True,
        )
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def admin_client(client: TestClient, db: Session, make_admin):
    """Factory: ``admin_client(role="owner") -> TestClient`` logged in with the CSRF header set."""
    from app.admin_auth.deps import create_session

    def _login(role: str = "owner") -> TestClient:
        user = make_admin(role)
        token = create_session(db, user)
        db.commit()
        client.cookies.set(get_settings().admin_session_cookie, token)
        client.headers["X-ZB-Admin"] = "1"
        return client

    return _login


@pytest.fixture
def sample_geo(db: Session):
    """A few countries/cities with real coordinates and IANA time zones."""
    from app.models import City, Country

    db.add_all(
        [
            Country(code="EG", name="Egypt", names={"ar": "مصر"}, capital="Cairo", timezones=["Africa/Cairo"]),
            Country(
                code="US",
                name="United States",
                names={"ar": "الولايات المتحدة"},
                capital="Washington",
                timezones=["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
            ),
            Country(
                code="GB",
                name="United Kingdom",
                names={"ar": "المملكة المتحدة"},
                capital="London",
                timezones=["Europe/London"],
            ),
        ]
    )
    db.flush()
    db.add_all(
        [
            City(
                id=360630,
                country_code="EG",
                name="Cairo",
                ascii_name="cairo",
                names={"ar": "القاهرة"},
                latitude=30.06263,
                longitude=31.24967,
                timezone="Africa/Cairo",
                population=9606916,
                is_capital=True,
            ),
            City(
                id=361058,
                country_code="EG",
                name="Alexandria",
                ascii_name="alexandria",
                names={},
                latitude=31.20176,
                longitude=29.91582,
                timezone="Africa/Cairo",
                population=3811516,
            ),
            City(
                id=5128581,
                country_code="US",
                name="New York City",
                ascii_name="new york city",
                names={},
                latitude=40.71427,
                longitude=-74.00597,
                timezone="America/New_York",
                population=8804190,
            ),
            City(
                id=5368361,
                country_code="US",
                name="Los Angeles",
                ascii_name="los angeles",
                names={},
                latitude=34.05223,
                longitude=-118.24368,
                timezone="America/Los_Angeles",
                population=3898747,
            ),
            City(
                id=2643743,
                country_code="GB",
                name="London",
                ascii_name="london",
                names={"ar": "لندن"},
                latitude=51.50853,
                longitude=-0.12574,
                timezone="Europe/London",
                population=8961989,
                is_capital=True,
            ),
        ]
    )
    db.commit()
