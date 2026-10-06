"""Content of the "your report is ready" email (English/Arabic, RTL-aware)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from babel.core import UnknownLocaleError
from babel.dates import format_date, format_time

from app.config import get_settings
from app.models import Order
from app.reports import i18n
from app.reports.schemas import EmailContent
from app.reports.templating import render_template
from app.utils import normalize_locale

WEBSITE = "zodiacblend.com"
CONTACT_EMAIL = "info@zodiacblend.com"
LOGO_PATH = "/brand/logo.png"  # served by the Next.js site (frontend/public/brand/logo.png, 512 px for retina)

_LATIN_FONTS = "Georgia, 'Times New Roman', serif"
_ARABIC_FONTS = "Tahoma, 'Segoe UI', Arial, sans-serif"


def site_url() -> str:
    return get_settings().site_url.rstrip("/")


def report_download_url(order_id: uuid.UUID, locale: str, token: str) -> str:
    """Link to the site's report page. The token is in the fragment, so it never reaches server logs."""
    return f"{site_url()}/{normalize_locale(locale)}/report/{order_id}#t={token}"


def format_expiry(moment: datetime, locale: str) -> str:
    """Exact expiry instant in UTC, e.g. "October 6, 2026, 2:30 PM UTC"."""
    utc_moment = moment.astimezone(UTC)
    try:
        day = format_date(utc_moment.date(), format="long", locale=locale)
        clock = format_time(utc_moment, format="short", tzinfo=UTC, locale=locale)
    except (UnknownLocaleError, ValueError):
        return format_expiry(moment, i18n.FALLBACK_LOCALE)
    separator = "، " if locale == "ar" else ", "
    # CLDR uses narrow no-break spaces ("2:30\u202fPM") that some email fonts render as boxes.
    return f"{day}{separator}{clock} UTC".replace("\u202f", " ").replace("\xa0", " ")


def build_report_email(order: Order, expires_at: datetime, token: str, *, attached: bool) -> EmailContent:
    locale = normalize_locale(order.locale)
    rtl = i18n.is_rtl(locale)
    name = (order.display_name or "").strip()
    expires = format_expiry(expires_at, locale)
    if rtl:
        # First-strong isolate keeps the Latin date/time ("…2:30 PM UTC") in order inside Arabic text.
        expires = f"\u2068{expires}\u2069"
    greeting = i18n.text(locale, "email_greeting_named", name=name) if name else i18n.text(locale, "email_greeting")
    context = {
        "locale": locale,
        "direction": "rtl" if rtl else "ltr",
        "align": "right" if rtl else "left",
        "start_side": "right" if rtl else "left",
        "font_stack": _ARABIC_FONTS if rtl else _LATIN_FONTS,
        "accent_style": "normal" if rtl else "italic",  # no synthetic italics for Arabic
        "t": i18n.strings(locale),
        "greeting": greeting,
        "preheader": i18n.text(locale, "email_preheader", expires=expires),
        "expiry_sentence": i18n.text(locale, "email_expiry", expires=expires),
        "download_url": report_download_url(order.id, locale, token),
        "attached": attached,
        "site_url": site_url(),
        "logo_url": f"{site_url()}{LOGO_PATH}",
        "website": WEBSITE,
        "contact_email": CONTACT_EMAIL,
    }
    return EmailContent(
        subject=i18n.text(locale, "email_subject"),
        text=render_template("email_report.txt", **context),
        html=render_template("email_report.html", **context),
    )
