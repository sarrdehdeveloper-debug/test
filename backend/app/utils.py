"""Shared helpers: time, request IP, locale handling, translation lookup."""

from __future__ import annotations

import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any

from fastapi import Request

from app.config import get_settings


def utcnow() -> datetime:
    return datetime.now(UTC)


def client_ip(request: Request) -> str:
    settings = get_settings()
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


def ip_hash(ip: str) -> str:
    """Keyed pseudonym of an IP for abuse analytics (raw visitor IPs are never stored).

    HMAC with a server secret: an unkeyed hash of the 2^32 IPv4 space is trivially reversible.
    """
    secret = get_settings().ip_hash_secret.encode()
    return hmac.new(secret, ip.encode(), hashlib.sha256).hexdigest()


def supported_locales() -> list[str]:
    return get_settings().locales


def default_locale() -> str:
    return supported_locales()[0]


def normalize_locale(locale: str | None) -> str:
    """Return a supported locale (``"ar-EG"`` -> ``"ar"``), falling back to the default."""
    if locale:
        base = locale.strip().lower().replace("_", "-").split("-")[0]
        if base in supported_locales():
            return base
    return default_locale()


def pick_translation(translations: dict[str, Any] | None, locale: str) -> dict[str, Any]:
    """Return the translation dict for ``locale``, falling back to the default locale, then any."""
    translations = translations or {}
    for candidate in (locale, default_locale()):
        value = translations.get(candidate)
        if value:
            return dict(value)
    for value in translations.values():
        if value:
            return dict(value)
    return {}
