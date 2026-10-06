"""Application settings, loaded from environment variables (prefix ``ZB_``).

Runtime-tunable business settings (price, prompt delays, Gemini model, ...) live in the
``settings`` table and are read through ``app.settings_store``; this module only holds
deployment configuration and secrets.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
_DEV_IP_HASH_SECRET = "dev-only-ip-hash-secret"  # noqa: S105 - placeholder, rejected in production


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

    # Trust X-Forwarded-For from the Next.js proxy / load balancer. Only safe when the API is
    # reachable exclusively through that proxy (otherwise clients can spoof their IP).
    trust_proxy_headers: bool = True
    # Secret for pseudonymising visitor IPs (utils.ip_hash). Must be set in production.
    ip_hash_secret: str = _DEV_IP_HASH_SECRET

    @property
    def reports_dir(self) -> Path:
        return self.storage_dir / self.reports_subdir

    @property
    def media_dir(self) -> Path:
        return self.storage_dir / self.media_subdir

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @model_validator(mode="after")
    def _check_production_secrets(self) -> Settings:
        if self.is_production:
            if self.ip_hash_secret == _DEV_IP_HASH_SECRET or len(self.ip_hash_secret) < 32:
                raise ValueError("ZB_IP_HASH_SECRET must be set to a random value of 32+ characters in production")
            if not self.cookie_secure:
                raise ValueError("ZB_COOKIE_SECURE must be true in production")
            if self.payment_provider == "fake":
                raise ValueError("ZB_PAYMENT_PROVIDER=fake is not allowed in production")
            if self.ai_provider == "fake":
                raise ValueError("ZB_AI_PROVIDER=fake is not allowed in production")
        if self.payment_provider == "stripe" and not (self.stripe_secret_key and self.stripe_webhook_secret):
            raise ValueError("ZB_STRIPE_SECRET_KEY and ZB_STRIPE_WEBHOOK_SECRET are required for Stripe")
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            raise ValueError("ZB_GEMINI_API_KEY is required when ZB_AI_PROVIDER=gemini")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
