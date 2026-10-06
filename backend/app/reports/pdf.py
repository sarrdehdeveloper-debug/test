"""Report PDF rendering: Jinja2 HTML (brand design, RTL for Arabic) printed by headless Chromium.

A browser is launched per render: Playwright's sync API must not be shared across threads and
the worker renders from several threads; at this volume the ~1 s start-up cost is irrelevant.
The page renders fully offline: page JavaScript is disabled, every network request is aborted,
and all assets (logo, fonts) are inline data URIs.

The running header ("ZODIAC BLEND") and footer (website, "page X / Y") are CSS page-margin boxes
(``@page { @top-center {...} }`` in report.css) rather than Chromium's ``header_template``: margin
boxes can be switched off on the full-bleed cover pages, mirrored for Arabic, and they use the
embedded brand fonts (header templates cannot load the page's web fonts).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from babel.core import UnknownLocaleError
from babel.dates import format_date
from markupsafe import Markup
from playwright.sync_api import Browser, Route, sync_playwright
from playwright.sync_api import Error as PlaywrightError

from app.charts.schemas import ChineseChart, Pillar, WesternChart, ZodiacPoint
from app.config import get_settings
from app.markdown import render_markdown
from app.models import Order, ReportSection
from app.reports import i18n
from app.reports.branding import font_face_css, logo_data_uri
from app.reports.schemas import PillarView, Placement, ReportView, SectionView
from app.reports.templating import read_template_file, render_template
from app.utils import normalize_locale, utcnow

REPORT_TEMPLATE = "report.html"
REPORT_STYLESHEET = "report.css"
WEBSITE = "zodiacblend.com"
CONTACT_EMAIL = "info@zodiacblend.com"
RENDER_TIMEOUT_MS = 60_000
# Fonts of the running header/footer (report.css @page margin boxes). Chromium only loads a web font
# once document text uses it, and the Arabic edition uses Cinzel nowhere else: with
# font-display: block the header would then print invisibly. They are loaded explicitly.
MARGIN_BOX_FONTS = ('600 10px "Cinzel"', '400 10px "Inter"')
_LOAD_FONTS_JS = (
    "fonts => Promise.all(fonts.map(font => document.fonts.load(font)))"
    ".then(() => document.fonts.ready).then(() => true)"
)

_ARABIC_CHARS = re.compile(r"[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]")


class PdfRenderError(RuntimeError):
    """Chromium could not produce the PDF (retryable: usually resources or a crashed browser)."""


def render_report_pdf(
    order: Order, sections: Sequence[ReportSection], *, generated_at: datetime | None = None
) -> bytes:
    """Render the paid report for ``order`` with its (completed) ``sections`` to PDF bytes."""
    return html_to_pdf(render_report_html(order, sections, generated_at=generated_at))


def render_report_html(order: Order, sections: Sequence[ReportSection], *, generated_at: datetime | None = None) -> str:
    view = build_report_view(order, sections, generated_at or utcnow())
    needs_arabic = i18n.is_rtl(view.locale) or _contains_arabic(view)
    return render_template(
        REPORT_TEMPLATE,
        view=view,
        # Both are bundled with the app (no user input), so they may bypass autoescaping.
        font_css=Markup(font_face_css(needs_arabic)),  # noqa: S704
        stylesheet=Markup(read_template_file(REPORT_STYLESHEET)),  # noqa: S704
        logo_uri=logo_data_uri(),
        website=WEBSITE,
        contact_email=CONTACT_EMAIL,
    )


def build_report_view(order: Order, sections: Sequence[ReportSection], generated_at: datetime) -> ReportView:
    locale = normalize_locale(order.locale)
    # Only the derived results are read: they survive the personal-data purge (chart["input"] is wiped).
    western = WesternChart.model_validate(order.chart["western"])
    chinese = ChineseChart.model_validate(order.chart["chinese"])
    ordered = sorted(sections, key=lambda s: s.slot)
    total = len(ordered)
    return ReportView(
        locale=locale,
        direction="rtl" if i18n.is_rtl(locale) else "ltr",
        text=i18n.strings(locale),
        name=(order.display_name or "").strip() or None,
        generated_on=i18n.text(locale, "generated_on", date=_format_long_date(generated_at, locale)),
        placements=[
            _placement(locale, "sun", western.sun),
            _placement(locale, "moon", western.moon),
            _placement(locale, "ascendant", western.ascendant),
        ],
        pillars=[
            _pillar_view(locale, "pillar_year", chinese.year),
            _pillar_view(locale, "pillar_month", chinese.month),
            _pillar_view(locale, "pillar_day", chinese.day),
            _pillar_view(locale, "pillar_hour", chinese.hour),
        ],
        day_master=i18n.text(
            locale,
            "day_master_value",
            polarity=i18n.polarity_name(locale, chinese.day.polarity),
            element=i18n.element_name(locale, chinese.day.element),
        ),
        notes=_chart_notes(locale, western, chinese),
        sections=[
            SectionView(
                number=index,
                label=i18n.text(locale, "part_label", number=index, total=total),
                title=section.title.strip() or i18n.text(locale, "section_fallback_title", number=index),
                html=render_markdown(section.content),
            )
            for index, section in enumerate(ordered, start=1)
        ],
    )


def format_degree(degree_in_sign: float) -> str:
    """24.3 -> "24°18′". Minutes are truncated (astrological convention: never round into the next sign)."""
    total_minutes = int(degree_in_sign * 60)
    return f"{total_minutes // 60}°{total_minutes % 60:02d}′"


def _placement(locale: str, label_key: str, point: ZodiacPoint) -> Placement:
    return Placement(
        label=i18n.text(locale, label_key),
        sign=i18n.sign_name(locale, point.sign),
        degree=format_degree(point.degree_in_sign),
    )


def _pillar_view(locale: str, label_key: str, pillar: Pillar) -> PillarView:
    return PillarView(
        label=i18n.text(locale, label_key),
        characters=f"{pillar.stem}{pillar.branch}",
        pinyin=f"{pillar.stem_pinyin} {pillar.branch_pinyin}".strip(),
        description=i18n.text(
            locale,
            "pillar_value",
            polarity=i18n.polarity_name(locale, pillar.polarity),
            element=i18n.element_name(locale, pillar.element),
            animal=i18n.animal_name(locale, pillar.animal),
        ),
    )


def _chart_notes(locale: str, western: WesternChart, chinese: ChineseChart) -> list[str]:
    notes = [i18n.text(locale, "zodiac_note"), i18n.text(locale, f"boundary_{chinese.year_boundary}")]
    if western.sun_on_cusp:
        notes.append(i18n.text(locale, "sun_on_cusp"))
    return notes


def _format_long_date(moment: datetime, locale: str) -> str:
    try:
        return format_date(moment.date(), format="long", locale=locale)
    except (UnknownLocaleError, ValueError):
        return format_date(moment.date(), format="long", locale=i18n.FALLBACK_LOCALE)


def _contains_arabic(view: ReportView) -> bool:
    texts = [view.name or "", *(s.title for s in view.sections), *(s.html for s in view.sections)]
    return any(_ARABIC_CHARS.search(t) for t in texts)


# ---------------------------------------------------------------------------
# Chromium
# ---------------------------------------------------------------------------


def html_to_pdf(html: str) -> bytes:
    """Print self-contained HTML to an A4 PDF with a fresh headless Chromium."""
    settings = get_settings()
    launch_options: dict[str, Any] = {"headless": True}
    if settings.chromium_executable:
        launch_options["executable_path"] = settings.chromium_executable
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**launch_options)
            try:
                return _print_pdf(browser, html)
            finally:
                browser.close()
    except PlaywrightError as exc:
        # Keep the message short: Playwright call logs can be long and are stored on the job row.
        first_line = (str(exc).splitlines() or [""])[0][:300]
        raise PdfRenderError(f"PDF rendering failed: {first_line}") from exc


def _print_pdf(browser: Browser, html: str) -> bytes:
    context = browser.new_context(java_script_enabled=False, offline=True)
    try:
        page = context.new_page()
        page.set_default_timeout(RENDER_TIMEOUT_MS)
        page.route("**/*", _block_external_request)
        page.set_content(html, wait_until="load")
        # Runs in Playwright's isolated world, so it works with page scripts disabled.
        page.evaluate(_LOAD_FONTS_JS, list(MARGIN_BOX_FONTS))
        return page.pdf(format="A4", print_background=True, prefer_css_page_size=True, outline=True, tagged=True)
    finally:
        context.close()


def _block_external_request(route: Route) -> None:
    if route.request.url.startswith("data:"):
        route.continue_()
    else:
        route.abort()
