"""PDF rendering, private storage and build_report (app.reports.pdf / storage / service)."""

from __future__ import annotations

import hashlib
import http.server
import re
import stat
import threading
from collections.abc import Iterator
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.charts.schemas import Chart
from app.config import get_settings
from app.jobs.queue import SEND_REPORT_EMAIL
from app.jobs.registry import PermanentJobError
from app.models import Job, Order, OrderStatus, Report, ReportSection, SectionStatus
from app.reports import pdf as pdf_module
from app.reports import service, storage
from app.reports.pdf import build_report_view, format_degree, html_to_pdf, render_report_html, render_report_pdf
from app.reports.preview import sample_order, sample_sections
from app.settings_store import set_settings
from app.utils import utcnow

FAKE_PDF = b"%PDF-1.7\n% fake report for tests\n%%EOF\n"


def _page_count(data: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page\b", data))


def _add_order_with_sections(db, locale: str = "en", *, slots: range = range(1, 7), **order_fields) -> Order:
    order = sample_order(locale, **order_fields)
    db.add(order)
    db.flush()
    db.add_all([s for s in sample_sections(order) if s.slot in slots])
    db.commit()
    return order


@pytest.fixture
def fake_renderer(monkeypatch) -> list[Order]:
    """Replace Chromium with a stub (logic tests); records the orders rendered."""
    rendered: list[Order] = []

    def _render(order, sections, **_):
        rendered.append(order)
        return FAKE_PDF

    monkeypatch.setattr(service, "render_report_pdf", _render)
    return rendered


# ---------------------------------------------------------------------------
# Formatting / HTML
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("degree", "expected"),
    [(24.3, "24°18′"), (0.0, "0°00′"), (3.8, "3°48′"), (29.9999, "29°59′"), (17.2, "17°12′")],
)
def test_format_degree_truncates_minutes(degree, expected):
    assert format_degree(degree) == expected


def test_report_view_english():
    order = sample_order("en", display_name="Layla Hassan")
    view = build_report_view(order, sample_sections(order), utcnow())
    assert view.direction == "ltr"
    assert [p.sign for p in view.placements] == ["Leo", "Pisces", "Scorpio"]
    assert view.placements[0].degree == "24°18′"
    assert view.pillars[0].characters == "庚午"
    assert view.pillars[0].description == "Yang Metal Horse"
    assert view.pillars[0].pinyin == "gēng wǔ"
    assert view.day_master == "Yin Wood"
    assert [s.number for s in view.sections] == [1, 2, 3, 4, 5, 6]
    assert view.sections[0].label == "Part 1 of 6"


def test_report_view_arabic_labels():
    order = sample_order("ar", display_name="ليلى")
    view = build_report_view(order, sample_sections(order), utcnow())
    assert view.direction == "rtl"
    assert [p.sign for p in view.placements] == ["الأسد", "الحوت", "العقرب"]
    assert "الحصان" in view.pillars[0].description
    assert view.text["report_title"] == "تقرير زودياك بلند الخاص بك"


def test_unsupported_locale_falls_back_to_english():
    order = sample_order("fr")
    view = build_report_view(order, sample_sections(order), utcnow())
    assert view.locale == "en"
    assert view.placements[0].sign == "Leo"


def test_sections_sorted_by_slot_and_fallback_title():
    order = sample_order("en")
    sections = sample_sections(order)
    sections[2].title = "   "
    view = build_report_view(order, list(reversed(sections)), utcnow())
    assert [s.number for s in view.sections] == [1, 2, 3, 4, 5, 6]
    assert view.sections[2].title == "Chapter 3"


def test_view_works_after_personal_data_purge():
    order = sample_order("en")
    order.chart = {**order.chart, "input": None}  # what the retention purge leaves behind
    Chart.model_validate(order.chart)
    view = build_report_view(order, sample_sections(order), utcnow())
    assert view.placements[1].sign == "Pisces"
    assert view.pillars[3].characters == "癸未"


def test_html_escapes_name_and_sanitises_sections():
    order = sample_order("en", display_name='<img src=x onerror="alert(1)">Eve')
    sections = sample_sections(order)
    sections[0].content = "Hello <script>alert('x')</script> **bold**\n\n[link](javascript:alert(1))"
    sections[1].title = "<b>Title</b>"
    html = render_report_html(order, sections)
    assert "<script>alert" not in html
    assert 'href="javascript:' not in html
    assert '<img src=x onerror="alert(1)">' not in html
    assert "&lt;img src=x" in html
    assert "&lt;b&gt;Title&lt;/b&gt;" in html
    assert "<strong>bold</strong>" in html


def test_html_is_self_contained():
    order = sample_order("ar")
    html = render_report_html(order, sample_sections(order))
    assert '<html lang="ar" dir="rtl">' in html
    assert 'font-family: "Amiri"' in html
    # Every src/url() is an inline data URI: nothing can be fetched while rendering.
    for match in re.findall(r"""(?:src=["']|url\(["']?)([^"')]+)""", html):
        assert match.startswith("data:"), match


def test_arabic_fonts_only_when_needed():
    en = sample_order("en", display_name="Alex")
    assert 'font-family: "Amiri"' not in render_report_html(en, sample_sections(en))
    en_arabic_name = sample_order("en", display_name="ليلى")
    assert 'font-family: "Amiri"' in render_report_html(en_arabic_name, sample_sections(en_arabic_name))


# ---------------------------------------------------------------------------
# Chromium rendering
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("locale", ["en", "ar"])
def test_render_report_pdf(locale):
    order = sample_order(locale)
    data = render_report_pdf(order, sample_sections(order))
    assert data.startswith(b"%PDF")
    assert 30_000 < len(data) < 5_000_000
    # cover + 6 chapters (each starts a new page) + back cover
    assert _page_count(data) >= 8
    # The running header is set in Cinzel, which the Arabic edition uses nowhere else: the font is only
    # embedded if the header was actually printed.
    assert b"Cinzel-SemiBold" in data


def test_arabic_pdf_uses_embedded_arabic_fonts():
    order = sample_order("ar", display_name="ليلى")
    data = render_report_pdf(order, sample_sections(order))
    # Static (non-variable) font: embedded with real glyph names, so Arabic text stays searchable.
    assert b"Amiri-Regular" in data
    assert b"Amiri-Bold" in data


def test_pdf_has_a_page_per_chapter_even_for_short_sections():
    order = sample_order("en", display_name=None)
    sections = sample_sections(order)
    for section in sections:
        section.content = "Short."
    assert _page_count(render_report_pdf(order, sections)) == 8


@pytest.fixture
def http_probe() -> Iterator[tuple[str, list[str]]]:
    """A local HTTP server that records every request it receives."""
    hits: list[str] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.end_headers()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", hits
    finally:
        server.shutdown()
        server.server_close()


def test_pdf_rendering_makes_no_network_requests(http_probe):
    base, hits = http_probe
    html = (
        f'<html><head><link rel="stylesheet" href="{base}/x.css"><style>@font-face {{font-family: X; '
        f"src: url({base}/font.woff2)}} body {{ font-family: X; background: url({base}/bg.png) }}</style></head>"
        f'<body><img src="{base}/img.png"><iframe src="{base}/frame"></iframe>'
        f'<script>fetch("{base}/script")</script><p>Hi</p></body></html>'
    )
    data = html_to_pdf(html)
    assert data.startswith(b"%PDF")
    assert hits == []


def test_render_error_is_wrapped(monkeypatch):
    monkeypatch.setattr(get_settings(), "chromium_executable", "/nonexistent/chrome")
    with pytest.raises(pdf_module.PdfRenderError):
        html_to_pdf("<p>x</p>")


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

KEY = "a" * 64


def test_save_report_is_private_and_atomic():
    path = storage.save_report(KEY, b"%PDF-data")
    assert path == get_settings().reports_dir / f"{KEY}.pdf"
    assert path.read_bytes() == b"%PDF-data"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    assert [p.name for p in path.parent.iterdir()] == [f"{KEY}.pdf"]  # no temp file left behind
    assert storage.read_report(KEY) == b"%PDF-data"
    with storage.open_report(KEY) as fh:
        assert fh.read() == b"%PDF-data"
    assert storage.report_exists(KEY)


def test_save_report_overwrites_existing_file():
    storage.save_report(KEY, b"one")
    storage.save_report(KEY, b"two")
    assert storage.read_report(KEY) == b"two"


def test_delete_report_missing_is_ok():
    assert storage.delete_report(KEY) is False
    storage.save_report(KEY, b"x")
    assert storage.delete_report(KEY) is True
    assert not storage.report_exists(KEY)


@pytest.mark.parametrize(
    "bad_key",
    [
        "../" + "a" * 61,
        "A" * 64,
        "a" * 63,
        "a" * 65,
        "g" * 64,
        "a" * 64 + "\n",
        "",
        "/etc/passwd",
        "a" * 32 + "/" + "a" * 31,
    ],
)
def test_invalid_file_keys_are_rejected(bad_key):
    with pytest.raises(storage.InvalidFileKey):
        storage.save_report(bad_key, b"x")
    with pytest.raises(storage.InvalidFileKey):
        storage.delete_report(bad_key)
    with pytest.raises(storage.InvalidFileKey):
        storage.open_report(bad_key)


# ---------------------------------------------------------------------------
# build_report
# ---------------------------------------------------------------------------


def test_build_report_creates_private_file_and_enqueues_email(db, fake_renderer):
    order = _add_order_with_sections(db, "en")
    before = utcnow()
    report = service.build_report(db, order)

    db.expire_all()
    report = db.scalar(select(Report).where(Report.order_id == order.id))
    assert report is not None
    assert re.fullmatch(r"[a-f0-9]{64}", report.file_key)
    path = storage.report_path(report.file_key)
    assert path.read_bytes() == FAKE_PDF
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert report.size_bytes == len(FAKE_PDF)
    assert report.sha256 == hashlib.sha256(FAKE_PDF).hexdigest()
    assert report.email_token_hash is None
    assert timedelta(hours=23, minutes=59) < report.expires_at - before <= timedelta(hours=24, minutes=1)

    order = db.get(Order, order.id)
    assert order.status == OrderStatus.READY
    assert order.ready_at is not None and order.ready_at >= before

    jobs = db.scalars(select(Job).where(Job.kind == SEND_REPORT_EMAIL)).all()
    assert len(jobs) == 1
    assert jobs[0].payload == {"order_id": str(order.id)}
    assert jobs[0].dedupe_key == f"send_report_email:{order.id}"


def test_build_report_uses_access_hours_setting(db, fake_renderer):
    set_settings(db, {"report_access_hours": 48})
    db.commit()
    order = _add_order_with_sections(db, "en")
    before = utcnow()
    report = service.build_report(db, order)
    assert timedelta(hours=47, minutes=59) < report.expires_at - before <= timedelta(hours=48, minutes=1)


def test_build_report_rerun_replaces_file(db, fake_renderer):
    order = _add_order_with_sections(db, "en")
    first = service.build_report(db, order)
    first_key = first.file_key
    first.email_token_hash = "f" * 64
    first.download_count = 3
    db.commit()

    second = service.build_report(db, order)
    db.expire_all()
    reports = db.scalars(select(Report).where(Report.order_id == order.id)).all()
    assert len(reports) == 1
    assert reports[0].file_key == second.file_key != first_key
    assert reports[0].email_token_hash is None
    assert reports[0].download_count == 0
    assert not storage.report_exists(first_key)
    assert storage.report_exists(second.file_key)
    assert len(db.scalars(select(Job).where(Job.kind == SEND_REPORT_EMAIL)).all()) == 1


def test_build_report_requires_all_sections(db, fake_renderer):
    order = _add_order_with_sections(db, "en", slots=range(1, 6))
    with pytest.raises(ValueError, match="not completed") as info:
        service.build_report(db, order)
    # Not retryable: the worker fails the job instead of re-running it with backoff.
    assert isinstance(info.value, PermanentJobError)
    assert fake_renderer == []
    assert db.scalar(select(Report)) is None
    assert not get_settings().reports_dir.exists() or not any(get_settings().reports_dir.iterdir())


@pytest.mark.parametrize("chart", [{}, {"western": {"sun": "leo"}}, {"input": None}])
def test_build_report_rejects_invalid_chart_permanently(db, fake_renderer, chart):
    order = _add_order_with_sections(db, "en")
    order.chart = chart
    db.commit()
    with pytest.raises(PermanentJobError, match="chart"):
        service.build_report(db, order)
    assert fake_renderer == []


def test_build_report_accepts_purged_chart(db, fake_renderer):
    order = _add_order_with_sections(db, "en")
    order.chart = {**order.chart, "input": None}
    db.commit()
    service.build_report(db, order)
    assert db.get(Order, order.id).status == OrderStatus.READY


def test_build_report_ignores_failed_sections(db, fake_renderer):
    order = _add_order_with_sections(db, "en")
    section = db.scalar(select(ReportSection).where(ReportSection.order_id == order.id, ReportSection.slot == 4))
    section.status = SectionStatus.FAILED
    db.commit()
    with pytest.raises(ValueError):
        service.build_report(db, order)


@pytest.mark.parametrize("status", [OrderStatus.REFUNDED, OrderStatus.AWAITING_PAYMENT, OrderStatus.ABANDONED])
def test_build_report_refuses_unpaid_or_refunded_orders(db, fake_renderer, status):
    order = _add_order_with_sections(db, "en", status=status)
    with pytest.raises(service.ReportBuildError):
        service.build_report(db, order)
    assert fake_renderer == []


def test_build_report_does_not_resurrect_an_order_refunded_while_rendering(db, monkeypatch):
    order = _add_order_with_sections(db, "en")

    def _render_while_refund_arrives(order_, sections, **_):
        # Another transaction (the payment webhook) refunds the order while Chromium is printing.
        from app.db import SessionLocal

        with SessionLocal() as other:
            other.get(Order, order_.id).status = OrderStatus.REFUNDED
            other.commit()
        return FAKE_PDF

    monkeypatch.setattr(service, "render_report_pdf", _render_while_refund_arrives)
    with pytest.raises(PermanentJobError):
        service.build_report(db, order)
    db.expire_all()
    assert db.get(Order, order.id).status == OrderStatus.REFUNDED
    assert db.scalar(select(Report)) is None
    assert list(get_settings().reports_dir.iterdir()) == []
    assert db.scalar(select(Job).where(Job.kind == SEND_REPORT_EMAIL)) is None


def test_build_report_rendering_errors_stay_retryable(db, monkeypatch):
    order = _add_order_with_sections(db, "en")

    def _crash(*args, **kwargs):
        raise pdf_module.PdfRenderError("PDF rendering failed: browser crashed")

    monkeypatch.setattr(service, "render_report_pdf", _crash)
    with pytest.raises(pdf_module.PdfRenderError) as info:
        service.build_report(db, order)
    assert not isinstance(info.value, PermanentJobError)
    db.expire_all()
    assert db.get(Order, order.id).status == OrderStatus.GENERATING


def test_build_report_removes_file_when_commit_fails(db, fake_renderer, monkeypatch):
    order = _add_order_with_sections(db, "en")

    def _boom(*args, **kwargs):
        raise RuntimeError("queue down")

    monkeypatch.setattr(service, "enqueue", _boom)
    with pytest.raises(RuntimeError):
        service.build_report(db, order)
    assert list(get_settings().reports_dir.iterdir()) == []
    db.expire_all()
    assert db.get(Order, order.id).status == OrderStatus.GENERATING


def test_build_report_end_to_end_with_chromium(db):
    order = _add_order_with_sections(db, "ar")
    report = service.build_report(db, order)
    data = storage.read_report(report.file_key)
    assert data.startswith(b"%PDF")
    assert _page_count(data) >= 8
    assert report.sha256 == hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Admin helpers
# ---------------------------------------------------------------------------


def test_extend_report_access_reopens_expired_order(db, fake_renderer):
    order = _add_order_with_sections(db, "en")
    report = service.build_report(db, order)
    report.expires_at = utcnow() - timedelta(hours=1)
    order.status = OrderStatus.EXPIRED
    db.commit()

    new_expiry = service.extend_report_access(db, order, 12)
    db.commit()
    assert timedelta(hours=11, minutes=59) < new_expiry - utcnow() <= timedelta(hours=12)
    assert order.status == OrderStatus.READY


def test_extend_report_access_fails_when_file_deleted(db, fake_renderer):
    order = _add_order_with_sections(db, "en")
    report = service.build_report(db, order)
    storage.delete_report(report.file_key)
    with pytest.raises(service.ReportFileGone):
        service.extend_report_access(db, order, 12)
    with pytest.raises(ValueError):
        service.extend_report_access(db, order, 0)


def test_enqueue_report_email_resend_is_not_deduplicated(db, fake_renderer):
    order = _add_order_with_sections(db, "en")
    service.build_report(db, order)
    assert service.enqueue_report_email(db, order) is None  # first delivery already queued
    assert service.enqueue_report_email(db, order, resend=True) is not None
    assert service.enqueue_report_email(db, order, resend=True) is not None
    db.commit()
    assert len(db.scalars(select(Job).where(Job.kind == SEND_REPORT_EMAIL)).all()) == 3
