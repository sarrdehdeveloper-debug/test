"""Application settings, loaded from environment variables (prefix ``ZB_``).

Runtime-tunable business settings (price, prompt delays, Gemini model, ...) live in the
``settings`` table and are read through ``app.settings_store``; this module only holds
deployment configuration and secrets.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ZB_", env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    env: Literal["development", "test", "production"] = "development"
    debug: bool = False

    database_url: str = "postgresql+psycopg://zodiac:zodiac@localhost:5432/zodiac"

    # Public URL of the Next.js site (used in emails, payment redirect URLs).
    site_url: str = "http://localhost:3000"
    # Locales the site supports; first one is the default.
    locales: list[str] = Field(default_factory=lambda: ["en", "ar"])

    # Storage
    storage_dir: Path = BASE_DIR / "storage"
    reports_subdir: str = "reports"
    media_subdir: str = "media"
    max_upload_bytes: int = 5 * 1024 * 1024

    # Admin sessions
    admin_session_cookie: str = "zb_admin"
    admin_session_hours: int = 12
    cookie_secure: bool = False  # True in production (HTTPS)

    # Payments
    payment_provider: Literal["stripe", "fake"] = "fake"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Gemini
    ai_provider: Literal["gemini", "fake"] = "fake"
    gemini_api_key: str = ""

    # Email
    email_backend: Literal["smtp", "console"] = "console"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    email_from: str = "Zodiac Blend <info@zodiacblend.com>"
    email_reply_to: str = "info@zodiacblend.com"

    # PDF rendering (Chromium via Playwright). Empty = Playwright default lookup.
    chromium_executable: str = ""

    # Worker
    worker_concurrency: int = 4
    worker_poll_seconds: float = 1.0
    job_lease_seconds: int = 300

    # Trust X-Forwarded-For from the Next.js proxy / load balancer.
    trust_proxy_headers: bool = True

    @property
    def reports_dir(self) -> Path:
        return self.storage_dir / self.reports_subdir

    @property
    def media_dir(self) -> Path:
        return self.storage_dir / self.media_subdir

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
