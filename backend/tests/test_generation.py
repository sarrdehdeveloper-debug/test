"""Tests for app.generation: word counting, AI clients, and the generate_report job."""

from __future__ import annotations

import json
import sys
import types
import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.charts.schemas import Chart, ChartInput, ChineseChart, Pillar, WesternChart, ZodiacPoint
from app.generation import ai, jobs
from app.generation.ai import AIPermanentError, AITransientError, FakeAIClient
from app.generation.service import load_generation_settings, section_title
from app.generation.words import count_words
from app.jobs import queue
from app.jobs.registry import PermanentJobError
from app.models import Job, Order, OrderStatus, PromptStatus, PromptVersion, ReportSection, SectionStatus
from app.security import hash_token
from app.settings_store import DEFAULTS, set_settings
from app.utils import utcnow

CUSTOMER_EMAIL = "layla.customer@example.com"


# ---------------------------------------------------------------------------
# Builders & fixtures
# ---------------------------------------------------------------------------


def _pillar(stem: str, branch: str, stem_py: str, branch_py: str, animal: str, element: str, polarity: str) -> Pillar:
    return Pillar(
        stem=stem,
        branch=branch,
        stem_pinyin=stem_py,
        branch_pinyin=branch_py,
        animal=animal,
        element=element,
        polarity=polarity,
    )


def make_chart() -> dict[str, Any]:
    """Chart for 1990-08-17 14:30 in Cairo (values realistic, not recomputed here)."""
    chart = Chart(
        input=ChartInput(
            local_datetime="1990-08-17T14:30:00+03:00",
            utc_datetime="1990-08-17T11:30:00+00:00",
            timezone="Africa/Cairo",
            utc_offset_minutes=180,
            is_dst=True,
            fold=0,
            latitude=30.06263,
            longitude=31.24967,
            place_label="Cairo, Egypt",
        ),
        western=WesternChart(
            sun=ZodiacPoint(sign="leo", longitude=144.31, degree_in_sign=24.31),
            moon=ZodiacPoint(sign="pisces", longitude=333.82, degree_in_sign=3.82),
            ascendant=ZodiacPoint(sign="scorpio", longitude=227.2, degree_in_sign=17.2),
            sun_on_cusp=False,
        ),
        chinese=ChineseChart(
            year_boundary="lichun",
            day_boundary="midnight",
            year=_pillar("庚", "午", "geng", "wu", "horse", "metal", "yang"),
            month=_pillar("甲", "申", "jia", "shen", "monkey", "wood", "yang"),
            day=_pillar("乙", "卯", "yi", "mao", "rabbit", "wood", "yin"),
            hour=_pillar("癸", "未", "gui", "wei", "goat", "water", "yin"),
        ),
    )
    return chart.model_dump(mode="json")


def template_for(slot: int, tag: str = "") -> str:
    return (
        f"SLOT-{slot}{tag}: Write in {{{{ language }}}} for {{{{ name }}}} about the {{{{ sun_sign }}}} Sun "
        "and the {{ year_element }} {{ year_animal }}."
    )


def add_version(
    db: Session,
    slot: int,
    *,
    version: int = 1,
    status: PromptStatus = PromptStatus.PUBLISHED,
    template: str | None = None,
    titles: dict[str, str] | None = None,
    min_words: int | None = None,
    system_instruction: str = "You are an astrologer. Answer in {{ language }}.",
) -> PromptVersion:
    row = PromptVersion(
        slot=slot,
        version=version,
        name=f"Prompt {slot}",
        section_titles={"en": f"Section {slot}", "ar": f"القسم {slot}"} if titles is None else titles,
        template=template or template_for(slot),
        system_instruction=system_instruction,
        min_words=min_words,
        status=status,
        published_at=utcnow() if status == PromptStatus.PUBLISHED else None,
    )
    db.add(row)
    db.flush()
    return row


def publish_all(db: Session, slots: tuple[int, ...] = (1, 2, 3, 4, 5, 6), **kwargs: Any) -> list[PromptVersion]:
    versions = [add_version(db, slot, **kwargs) for slot in slots]
    db.commit()
    return versions


def make_order(
    db: Session,
    *,
    status: OrderStatus = OrderStatus.QUEUED,
    locale: str = "en",
    display_name: str | None = "Layla",
) -> Order:
    order = Order(
        status=status,
        email=CUSTOMER_EMAIL,
        locale=locale,
        display_name=display_name,
        chart=make_chart(),
        calc_version="zb-calc-1",
        list_price_cents=2900,
        amount_cents=2900,
        currency="USD",
        payment_provider="fake",
        paid_at=utcnow() if status != OrderStatus.AWAITING_PAYMENT else None,
        access_token_hash=hash_token("order-access-token"),
    )
    db.add(order)
    db.commit()
    return order


def claim_job(db: Session, order: Order) -> Job:
    queue.enqueue(db, queue.GENERATE_REPORT, {"order_id": str(order.id)}, dedupe_key=f"generate_report:{order.id}")
    db.commit()
    job = queue.claim_next(db, "test-worker", 60)
    assert job is not None
    db.commit()
    return job


def reclaim(db: Session, job: Job) -> Job:
    """Simulate the worker scheduling a retry and claiming the job again."""
    queue.mark_failed_attempt(job, "retry")
    job.run_at = utcnow() - timedelta(seconds=1)
    db.commit()
    again = queue.claim_next(db, "test-worker", 60)
    assert again is not None and again.id == job.id
    db.commit()
    return again


def sections_of(db: Session, order: Order) -> list[ReportSection]:
    db.expire_all()
    return list(
        db.scalars(select(ReportSection).where(ReportSection.order_id == order.id).order_by(ReportSection.slot))
    )


def reload(db: Session, order: Order) -> Order:
    db.expire_all()
    fresh = db.get(Order, order.id)
    assert fresh is not None
    return fresh


@pytest.fixture
def use_ai(monkeypatch):
    """``use_ai(client)`` makes ``ai.get_ai_client()`` return ``client`` (a FakeAIClient by default)."""

    def _install(client: Any = None) -> Any:
        client = client or FakeAIClient()
        monkeypatch.setattr(ai, "get_ai_client", lambda: client)
        return client

    return _install


@pytest.fixture
def sleeps(monkeypatch) -> list[float]:
    calls: list[float] = []
    monkeypatch.setattr(jobs, "_sleep", calls.append)
    return calls


@pytest.fixture
def built(monkeypatch) -> list[uuid.UUID]:
    """Stub for app.reports.service.build_report: records the order and marks it ready."""
    calls: list[uuid.UUID] = []

    def _fake_build(db: Session, order: Order) -> None:
        calls.append(order.id)
        order.status = OrderStatus.READY
        order.ready_at = utcnow()

    monkeypatch.setattr(jobs, "_build_report", _fake_build)
    return calls


# ---------------------------------------------------------------------------
# Word counting
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text_in", "expected"),
    [
        ("Hello world", 2),
        ("  Hello   world \n\n again ", 3),
        ("don't stop: well-being matters", 4),
        ("The Sun at 24.3 degrees, 1,000 times", 7),
        ("snake_case and __bold__ and *emphasis*", 6),
        ("", 0),
        (None, 0),
        ("!!! --- ### ...", 0),
    ],
)
def test_count_words_english(text_in, expected):
    assert count_words(text_in) == expected


def test_count_words_markdown_syntax_is_ignored():
    md = (
        "## Your **Core** Self\n\n"
        "> A quote here\n\n"
        "- first item\n"
        "* second item\n"
        "1. third item\n"
        "10) fourth item\n\n"
        "| Sign | Animal |\n|---|---|\n| Leo | Horse |\n\n"
        'See [the guide](https://example.com/guide?a=1 "Guide") and https://zodiacblend.com/page now.\n'
        "---\n"
    )
    # Your Core Self(3) A quote here(3) first item(2) second item(2) third item(2) fourth item(2)
    # Sign Animal Leo Horse(4) See the guide and <url> now(6)
    assert count_words(md) == 24


def test_count_words_arabic_with_diacritics_and_punctuation():
    assert count_words("مرحبا بالعالم") == 2
    assert count_words("مُحَمَّدٌ رَسُولُ اللَّهِ") == 3  # harakat must not split words
    assert count_words("الشمس في برج الأسد، والقمر في الحوت.") == 7
    assert count_words("## عنوان القسم\n\n- **نقطة** أولى") == 4


def test_count_words_cjk_each_character_is_a_word():
    assert count_words("你好世界") == 4
    assert count_words("日本語のテキスト") == 8
    assert count_words("テスト・データ") == 6  # the middle dot is punctuation
    assert count_words("Hello，世界！") == 3
    assert count_words("Leo 狮子座 and Horse 马") == 7


def test_count_words_other_scripts():
    assert count_words("Привет, мир") == 2
    assert count_words("안녕하세요 세계") == 2  # Hangul uses spaces between words
    assert count_words("नमस्ते दुनिया") == 2  # Devanagari vowel signs are combining marks
    assert count_words("می‌خواهم بروم") == 2  # ZWNJ joins a Persian word


# ---------------------------------------------------------------------------
# Fake AI client
# ---------------------------------------------------------------------------


def _generate(client: Any, prompt: str, system: str | None = None) -> ai.AIResult:
    return client.generate(
        prompt, system_instruction=system, model="m-1", temperature=0.5, max_output_tokens=512, timeout_seconds=10
    )


def test_fake_client_default_reply_is_long_markdown_in_english():
    client = FakeAIClient()
    result = _generate(client, "Write in English about the Leo Sun.")
    assert 380 <= count_words(result.text) <= 420
    assert result.text.startswith("## ")
    assert not any("؀" <= ch <= "ۿ" for ch in result.text)
    assert result.model == "m-1"
    assert result.finish_reason == "STOP"
    assert result.output_tokens == count_words(result.text)


def test_fake_client_detects_arabic_and_is_deterministic():
    client = FakeAIClient()
    first = _generate(client, "Write in Arabic about the Leo Sun.")
    second = _generate(client, "Write in Arabic about the Leo Sun.")
    other = _generate(client, "Write in Arabic about the Pisces Moon.")
    assert first.text == second.text
    assert first.text != other.text
    assert sum("؀" <= ch <= "ۿ" for ch in first.text) > 500
    assert any("؀" <= ch <= "ۿ" for ch in _generate(client, "x", system="Answer in Arabic.").text)


def test_fake_client_script_and_call_recording():
    client = FakeAIClient(["Short reply.", 30, AITransientError("boom")], target_words=50)
    assert _generate(client, "p1").text == "Short reply."
    assert count_words(_generate(client, "p2").text) == 30
    with pytest.raises(AITransientError):
        _generate(client, "p3", system="sys")
    assert count_words(_generate(client, "p4").text) == 50  # script exhausted -> default length
    assert [c.prompt for c in client.calls] == ["p1", "p2", "p3", "p4"]
    assert client.calls[2].system_instruction == "sys"
    assert client.calls[0].max_output_tokens == 512 and client.calls[0].timeout_seconds == 10


# ---------------------------------------------------------------------------
# Gemini client (SDK exercised end to end against a mocked HTTP transport)
# ---------------------------------------------------------------------------


def _gemini(handler) -> ai.GeminiClient:
    from google import genai
    from google.genai import types as genai_types

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    sdk = genai.Client(api_key="test-key", http_options=genai_types.HttpOptions(httpx_client=http_client))
    return ai.GeminiClient("test-key", client=sdk)


def test_gemini_client_request_and_response_mapping():
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["timeout"] = request.extensions.get("timeout")
        seen["api_key"] = request.headers.get("x-goog-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [
                                {"text": "internal reasoning", "thought": True},  # never part of the reply
                                {"text": "  ## Hi\n\nHello **there**  "},
                            ],
                        },
                        "finishReason": "STOP",
                    }
                ],
                "usageMetadata": {"promptTokenCount": 42, "candidatesTokenCount": 7, "totalTokenCount": 49},
                "modelVersion": "gemini-2.5-flash-001",
            },
        )

    result = _gemini(handler).generate(
        "Tell me about Leo",
        system_instruction="Be warm",
        model="gemini-2.5-flash",
        temperature=0.7,
        max_output_tokens=1024,
        timeout_seconds=45,
    )
    assert result == ai.AIResult(
        text="## Hi\n\nHello **there**",
        model="gemini-2.5-flash-001",
        input_tokens=42,
        output_tokens=7,
        finish_reason="STOP",
    )
    assert seen["url"].endswith("/models/gemini-2.5-flash:generateContent")
    assert seen["api_key"] == "test-key"
    assert seen["timeout"]["read"] == 45.0  # seconds setting -> SDK milliseconds -> httpx seconds
    body = seen["body"]
    assert body["contents"][0]["parts"][0]["text"] == "Tell me about Leo"
    assert body["systemInstruction"]["parts"][0]["text"] == "Be warm"
    assert body["generationConfig"] == {"temperature": 0.7, "maxOutputTokens": 1024}
    assert "tools" not in body


def test_gemini_client_without_system_instruction_and_blocked_prompt():
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}})

    result = _gemini(handler).generate(
        "x", system_instruction=None, model="m", temperature=1.0, max_output_tokens=100, timeout_seconds=5
    )
    assert "systemInstruction" not in seen["body"]
    assert result.text == ""
    assert result.finish_reason == "BLOCKED_SAFETY"
    assert result.input_tokens is None and result.output_tokens is None


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (429, AITransientError),
        (408, AITransientError),
        (500, AITransientError),
        (503, AITransientError),
        (400, AIPermanentError),
        (401, AIPermanentError),
        (403, AIPermanentError),
        (404, AIPermanentError),
    ],
)
def test_gemini_client_classifies_http_errors(status, expected):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"code": status, "message": "nope", "status": "X"}})

    with pytest.raises(expected) as info:
        _gemini(handler).generate(
            "x", system_instruction=None, model="m", temperature=1, max_output_tokens=100, timeout_seconds=5
        )
    assert str(status) in str(info.value)
    assert "x" not in str(info.value).split(":")[0]  # the prompt is not echoed into the error


@pytest.mark.parametrize("exc_type", [httpx.ReadTimeout, httpx.ConnectError, httpx.RemoteProtocolError])
def test_gemini_client_network_errors_are_transient(exc_type):
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc_type("network down", request=request)

    with pytest.raises(AITransientError):
        _gemini(handler).generate(
            "x", system_instruction=None, model="m", temperature=1, max_output_tokens=100, timeout_seconds=5
        )


def test_get_ai_client_selects_provider(monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    ai._gemini_client.cache_clear()
    monkeypatch.setattr(settings, "ai_provider", "fake")
    assert isinstance(ai.get_ai_client(), FakeAIClient)

    monkeypatch.setattr(settings, "env", "production")
    with pytest.raises(ai.AIConfigurationError):
        ai.get_ai_client()

    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    with pytest.raises(ai.AIConfigurationError, match="GEMINI_API_KEY"):
        ai.get_ai_client()

    monkeypatch.setattr(settings, "gemini_api_key", "key-123")
    client = ai.get_ai_client()
    assert isinstance(client, ai.GeminiClient)
    assert ai.get_ai_client() is client  # cached per key
    ai._gemini_client.cache_clear()


# ---------------------------------------------------------------------------
# Service helpers
# ---------------------------------------------------------------------------


def test_section_title_fallbacks():
    version = PromptVersion(slot=1, version=1, name="Internal name", section_titles={"en": "Core", "ar": "الجوهر"})
    assert section_title(version, "ar") == "الجوهر"
    assert section_title(version, "fr") == "Core"
    version.section_titles = {"ar": "الجوهر"}
    assert section_title(version, "en") == "الجوهر"
    version.section_titles = {"en": "  "}
    assert section_title(version, "en") == "Internal name"


def test_generation_settings_come_from_settings_store(db):
    set_settings(db, {"gemini_model": "gemini-x", "prompt_delay_min_seconds": 0.5, "max_attempts_per_prompt": 4})
    db.commit()
    settings = load_generation_settings(db)
    assert settings.model == "gemini-x"
    assert settings.delay_min_seconds == 0.5
    assert settings.delay_max_seconds == DEFAULTS["prompt_delay_max_seconds"]
    assert settings.max_attempts_per_prompt == 4
    assert settings.min_words == DEFAULTS["min_words"]


# ---------------------------------------------------------------------------
# generate_report job
# ---------------------------------------------------------------------------


def test_generate_report_full_flow(db, use_ai, sleeps, built):
    set_settings(
        db,
        {
            "gemini_model": "gemini-test-model",
            "gemini_temperature": 0.4,
            "gemini_max_output_tokens": 4096,
            "gemini_timeout_seconds": 45,
            "prompt_delay_min_seconds": 0.5,
            "prompt_delay_max_seconds": 1.5,
        },
    )
    versions = publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    lease_before = job.locked_until
    client = use_ai()

    jobs.handle_generate_report(db, job)

    sections = sections_of(db, order)
    assert [s.slot for s in sections] == [1, 2, 3, 4, 5, 6]
    for section, version in zip(sections, versions, strict=True):
        assert section.status == SectionStatus.DONE
        assert section.title == f"Section {section.slot}"
        assert section.prompt_version_id == version.id
        assert section.attempts == 1
        assert section.word_count == count_words(section.content) >= 25
        assert section.model == "gemini-test-model"
        assert section.input_tokens and section.output_tokens
        assert section.last_error is None

    order = reload(db, order)
    assert order.prompt_version_ids == [v.id for v in versions]
    assert order.generation_started_at is not None
    assert order.status == OrderStatus.READY  # set by the build_report stub
    assert built == [order.id]

    # One AI call per slot, in slot order, rendered with the order's chart and settings.
    assert [c.prompt.split(":")[0] for c in client.calls] == [f"SLOT-{i}" for i in range(1, 7)]
    first = client.calls[0]
    assert "Write in English for Layla about the Leo Sun and the Metal Horse." in first.prompt
    assert first.system_instruction == "You are an astrologer. Answer in English."
    assert (first.model, first.temperature, first.max_output_tokens, first.timeout_seconds) == (
        "gemini-test-model",
        0.4,
        4096,
        45,
    )
    # The customer's email address is never sent to the AI provider.
    assert all(CUSTOMER_EMAIL not in (c.prompt + (c.system_instruction or "")) for c in client.calls)

    # 6 calls -> 5 pauses, each within the configured bounds.
    assert len(sleeps) == 5
    assert all(0.5 <= s <= 1.5 for s in sleeps)

    db.refresh(job)
    assert job.locked_until > lease_before  # lease extended while working


def test_generate_report_arabic_titles_with_fallback(db, use_ai, sleeps, built):
    publish_all(db, slots=(1, 2, 3, 4, 5))
    add_version(db, 6, titles={"en": "Only English"})
    db.commit()
    order = make_order(db, locale="ar", display_name=None)
    client = use_ai()

    jobs.handle_generate_report(db, claim_job(db, order))

    titles = [s.title for s in sections_of(db, order)]
    assert titles == ["القسم 1", "القسم 2", "القسم 3", "القسم 4", "القسم 5", "Only English"]
    assert "Write in Arabic for  about" in client.calls[0].prompt  # empty name renders as ""
    assert all(any("؀" <= ch <= "ۿ" for ch in s.content) for s in sections_of(db, order))


def test_short_reply_is_requested_again(db, use_ai, sleeps, built):
    publish_all(db)
    order = make_order(db)
    client = use_ai(FakeAIClient(["Too short.", "Still far too short a reply.", 120]))

    jobs.handle_generate_report(db, claim_job(db, order))

    sections = sections_of(db, order)
    first = sections[0]
    assert first.status == SectionStatus.DONE
    assert first.attempts == 3
    assert first.word_count == 120
    # Tokens of all three billed calls are summed.
    assert first.output_tokens == count_words("Too short.") + count_words("Still far too short a reply.") + 120
    assert [s.attempts for s in sections[1:]] == [1] * 5
    assert len(client.calls) == 8
    assert client.calls[0].prompt == client.calls[1].prompt == client.calls[2].prompt
    assert len(sleeps) == 7  # a pause between ANY two consecutive calls, retries included
    low, high = DEFAULTS["prompt_delay_min_seconds"], DEFAULTS["prompt_delay_max_seconds"]
    assert all(low <= s <= high for s in sleeps)


def test_all_replies_too_short_fails_the_order(db, use_ai, sleeps, built):
    set_settings(db, {"max_attempts_per_prompt": 2})
    publish_all(db)
    order = make_order(db)
    client = use_ai(FakeAIClient([150, "short", "also short"]))
    job = claim_job(db, order)

    with pytest.raises(PermanentJobError, match="too short"):
        jobs.handle_generate_report(db, job)

    sections = sections_of(db, order)
    assert [(s.slot, s.status) for s in sections] == [(1, SectionStatus.DONE), (2, SectionStatus.FAILED)]
    assert sections[1].attempts == 2
    assert sections[1].content == "also short"
    assert "2 attempts" in sections[1].last_error
    order = reload(db, order)
    assert order.status == OrderStatus.GENERATION_FAILED
    assert "section 2" in order.last_error and "too short" in order.last_error
    assert len(client.calls) == 3
    assert built == []


def test_version_min_words_overrides_global_setting(db, use_ai, sleeps, built):
    set_settings(db, {"min_words": 1000, "max_attempts_per_prompt": 1})
    for slot in range(1, 7):
        add_version(db, slot, min_words=10)
    db.commit()
    order = make_order(db)
    use_ai(FakeAIClient([12] * 6))

    jobs.handle_generate_report(db, claim_job(db, order))

    assert [s.word_count for s in sections_of(db, order)] == [12] * 6
    assert built == [order.id]


def test_min_words_zero_still_rejects_empty_reply(db, use_ai, sleeps, built):
    set_settings(db, {"min_words": 0})
    publish_all(db)
    order = make_order(db)
    use_ai(FakeAIClient(["", "Finally some words"]))

    jobs.handle_generate_report(db, claim_job(db, order))

    first = sections_of(db, order)[0]
    assert first.attempts == 2 and first.content == "Finally some words"


def test_transient_error_keeps_finished_sections(db, use_ai, sleeps, built):
    publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    use_ai(FakeAIClient([200, 200, 200, AITransientError("503 overloaded")]))

    with pytest.raises(AITransientError):
        jobs.handle_generate_report(db, job)

    assert [s.slot for s in sections_of(db, order)] == [1, 2, 3]
    order = reload(db, order)
    assert order.status == OrderStatus.GENERATING  # still in progress; the job will be retried
    assert order.last_error is None
    contents_before = [s.content for s in sections_of(db, order)]

    job = reclaim(db, job)
    retry_client = use_ai()
    jobs.handle_generate_report(db, job)

    # Only the missing sections were requested; finished ones were not regenerated.
    assert [c.prompt.split(":")[0] for c in retry_client.calls] == ["SLOT-4", "SLOT-5", "SLOT-6"]
    sections = sections_of(db, order)
    assert [s.slot for s in sections] == [1, 2, 3, 4, 5, 6]
    assert [s.content for s in sections[:3]] == contents_before
    assert built == [order.id]


def test_transient_error_on_last_attempt_marks_order_failed(db, use_ai, sleeps, built):
    publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    job.attempts = job.max_attempts
    db.commit()
    use_ai(FakeAIClient([AITransientError("429 quota")]))

    with pytest.raises(AITransientError):
        jobs.handle_generate_report(db, job)

    order = reload(db, order)
    assert order.status == OrderStatus.GENERATION_FAILED
    assert order.last_error.startswith("ai_unavailable")


def test_permanent_ai_error_fails_order(db, use_ai, sleeps, built):
    publish_all(db)
    order = make_order(db)
    use_ai(FakeAIClient([AIPermanentError("Gemini API error 404 NOT_FOUND: model not found")]))

    with pytest.raises(PermanentJobError, match="model not found"):
        jobs.handle_generate_report(db, claim_job(db, order))

    order = reload(db, order)
    assert order.status == OrderStatus.GENERATION_FAILED
    assert order.last_error.startswith("ai_error")


def test_ai_not_configured_fails_order(db, monkeypatch, sleeps, built):
    publish_all(db)
    order = make_order(db)

    def _raise() -> None:
        raise ai.AIConfigurationError("ZB_AI_PROVIDER=gemini requires ZB_GEMINI_API_KEY")

    monkeypatch.setattr(ai, "get_ai_client", _raise)
    with pytest.raises(PermanentJobError):
        jobs.handle_generate_report(db, claim_job(db, order))
    assert reload(db, order).status == OrderStatus.GENERATION_FAILED


def test_missing_published_prompt_fails_order(db, use_ai, sleeps, built):
    publish_all(db, slots=(1, 2, 3, 4, 5))
    add_version(db, 6, status=PromptStatus.DRAFT)
    db.commit()
    order = make_order(db)
    client = use_ai()

    with pytest.raises(PermanentJobError, match="prompts_not_configured"):
        jobs.handle_generate_report(db, claim_job(db, order))

    order = reload(db, order)
    assert order.status == OrderStatus.GENERATION_FAILED
    assert order.last_error == "prompts_not_configured"
    assert order.prompt_version_ids == []
    assert client.calls == []
    assert sections_of(db, order) == []


def test_failed_order_can_be_retried_after_fixing_prompts(db, use_ai, sleeps, built):
    publish_all(db, slots=(1, 2, 3, 4, 5))
    order = make_order(db)
    job = claim_job(db, order)
    use_ai()
    with pytest.raises(PermanentJobError):
        jobs.handle_generate_report(db, job)

    publish_all(db, slots=(6,))
    jobs.handle_generate_report(db, reclaim(db, job))

    order = reload(db, order)
    assert order.last_error is None
    assert len(order.prompt_version_ids) == 6
    assert len(sections_of(db, order)) == 6
    assert built == [order.id]


def test_prompt_snapshot_is_used_on_retry(db, use_ai, sleeps, built):
    versions = publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    use_ai(FakeAIClient([200, AITransientError("timeout")]))
    with pytest.raises(AITransientError):
        jobs.handle_generate_report(db, job)

    # An admin publishes a new version of slot 2 while the order waits for its retry.
    old = versions[1]
    old.status = PromptStatus.ARCHIVED
    db.flush()
    new = add_version(db, 2, version=2, template=template_for(2, tag="-NEW"))
    db.commit()

    client = use_ai()
    jobs.handle_generate_report(db, reclaim(db, job))

    assert client.calls[0].prompt.startswith("SLOT-2:")
    section2 = sections_of(db, order)[1]
    assert section2.prompt_version_id == old.id != new.id
    assert reload(db, order).prompt_version_ids == [v.id for v in versions]


@pytest.mark.parametrize(
    "status",
    [
        OrderStatus.AWAITING_PAYMENT,
        OrderStatus.READY,
        OrderStatus.EXPIRED,
        OrderStatus.REFUNDED,
        OrderStatus.ABANDONED,
    ],
)
def test_orders_not_awaiting_a_report_are_skipped(db, use_ai, sleeps, built, status):
    publish_all(db)
    order = make_order(db, status=status)
    client = use_ai()

    jobs.handle_generate_report(db, claim_job(db, order))

    order = reload(db, order)
    assert order.status == status
    assert order.prompt_version_ids == []
    assert client.calls == [] and built == []
    assert sections_of(db, order) == []


def test_refund_during_generation_stops_work(db, use_ai, sleeps, built):
    from app.db import SessionLocal

    publish_all(db)
    order = make_order(db)

    class RefundingClient(FakeAIClient):
        def generate(self, prompt: str, **kwargs: Any) -> ai.AIResult:
            if len(self.calls) == 1:  # while the 2nd section is being written, a refund arrives
                with SessionLocal() as other:
                    other.get(Order, order.id).status = OrderStatus.REFUNDED
                    other.commit()
            return super().generate(prompt, **kwargs)

    client = use_ai(RefundingClient())
    jobs.handle_generate_report(db, claim_job(db, order))

    assert len(client.calls) == 2
    assert [s.slot for s in sections_of(db, order)] == [1, 2]
    assert reload(db, order).status == OrderStatus.REFUNDED
    assert built == []


def test_concurrent_generation_is_prevented_by_order_lock(db, use_ai, sleeps, built):
    from app.db import engine

    publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    client = use_ai()
    key = {"key": f"generate_report:{order.id}"}

    with engine.connect() as other:
        assert other.scalar(text("SELECT pg_try_advisory_lock(hashtext(:key))"), key)
        with pytest.raises(jobs.OrderBusyError):
            jobs.handle_generate_report(db, job)
        other.scalar(text("SELECT pg_advisory_unlock(hashtext(:key))"), key)

    assert client.calls == []
    assert reload(db, order).status == OrderStatus.QUEUED

    jobs.handle_generate_report(db, job)
    assert len(sections_of(db, order)) == 6
    with engine.connect() as other:  # the lock was released after the run
        assert other.scalar(text("SELECT pg_try_advisory_lock(hashtext(:key))"), key)
        other.scalar(text("SELECT pg_advisory_unlock(hashtext(:key))"), key)


def test_build_report_failure_is_retried_without_new_ai_calls(db, use_ai, sleeps, monkeypatch):
    publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    use_ai()
    attempts: list[int] = []

    def flaky_build(db_: Session, order_: Order) -> None:
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("chromium crashed")
        order_.status = OrderStatus.READY

    monkeypatch.setattr(jobs, "_build_report", flaky_build)
    with pytest.raises(RuntimeError):
        jobs.handle_generate_report(db, job)
    assert reload(db, order).status == OrderStatus.GENERATING

    retry_client = use_ai()
    jobs.handle_generate_report(db, reclaim(db, job))
    assert retry_client.calls == []
    assert len(attempts) == 2
    assert reload(db, order).status == OrderStatus.READY


def test_unexpected_error_on_last_attempt_marks_order_failed(db, use_ai, sleeps, monkeypatch):
    publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    job.attempts = job.max_attempts
    db.commit()
    use_ai()

    def broken_build(db_: Session, order_: Order) -> None:
        raise RuntimeError("disk full")

    monkeypatch.setattr(jobs, "_build_report", broken_build)
    with pytest.raises(RuntimeError):
        jobs.handle_generate_report(db, job)
    order = reload(db, order)
    assert order.status == OrderStatus.GENERATION_FAILED
    assert order.last_error == "unexpected_error: RuntimeError"


def test_calls_reports_service_build_report(db, use_ai, sleeps, monkeypatch):
    """Without the test stub, the job calls app.reports.service.build_report(db, order)."""
    publish_all(db)
    order = make_order(db)
    calls: list[Any] = []
    stub = types.ModuleType("app.reports.service")
    stub.build_report = lambda db_, order_: calls.append((db_, order_.id))  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "app.reports.service", stub)
    use_ai()

    jobs.handle_generate_report(db, claim_job(db, order))

    assert calls == [(db, order.id)]


def test_broken_template_is_a_permanent_failure(db, use_ai, sleeps, built):
    publish_all(db, slots=(1, 2, 3, 4, 5))
    add_version(db, 6, template="Hello {{ unknown_variable }}")  # bypasses admin validation
    db.commit()
    order = make_order(db)
    use_ai()

    with pytest.raises(PermanentJobError, match="invalid_template: slot 6"):
        jobs.handle_generate_report(db, claim_job(db, order))
    order = reload(db, order)
    assert order.status == OrderStatus.GENERATION_FAILED
    assert len(sections_of(db, order)) == 5


def test_invalid_chart_is_a_permanent_failure(db, use_ai, sleeps, built):
    publish_all(db)
    order = make_order(db)
    order.chart = {"broken": True}
    db.commit()
    use_ai()

    with pytest.raises(PermanentJobError, match="invalid_chart"):
        jobs.handle_generate_report(db, claim_job(db, order))
    assert reload(db, order).status == OrderStatus.GENERATION_FAILED


@pytest.mark.parametrize("payload", [{}, {"order_id": "not-a-uuid"}, {"order_id": None}])
def test_invalid_payload_is_permanent(db, payload):
    job = Job(kind=queue.GENERATE_REPORT, payload=payload, attempts=1, max_attempts=5)
    with pytest.raises(PermanentJobError, match="payload"):
        jobs.handle_generate_report(db, job)


def test_unknown_order_is_permanent(db):
    job = Job(kind=queue.GENERATE_REPORT, payload={"order_id": str(uuid.uuid4())}, attempts=1, max_attempts=5)
    with pytest.raises(PermanentJobError, match="order_not_found"):
        jobs.handle_generate_report(db, job)


def test_registry_points_at_the_handler():
    from app.jobs.registry import get_handler

    assert get_handler(queue.GENERATE_REPORT) is jobs.handle_generate_report


def test_lease_is_extended_before_every_ai_call(db, use_ai, sleeps, built):
    from app.config import get_settings
    from app.db import SessionLocal

    publish_all(db)
    order = make_order(db)
    job = claim_job(db, order)
    lease = get_settings().job_lease_seconds
    remaining: list[float] = []

    class LeaseCheckingClient(FakeAIClient):
        def generate(self, prompt: str, **kwargs: Any) -> ai.AIResult:
            with SessionLocal() as other:  # what another worker would see right now
                locked_until = other.get(Job, job.id).locked_until
            remaining.append((locked_until - utcnow()).total_seconds())
            return super().generate(prompt, **kwargs)

    use_ai(LeaseCheckingClient(["short", 300, 300, 300, 300, 300, 300]))
    jobs.handle_generate_report(db, job)

    assert len(remaining) == 7
    assert all(lease - 5 < r <= lease for r in remaining)


def test_display_name_is_data_not_template_code(db, use_ai, sleeps, built):
    publish_all(db)
    order = make_order(db, display_name="{{ sun_sign }} {% raw %}")
    client = use_ai()

    jobs.handle_generate_report(db, claim_job(db, order))

    assert "for {{ sun_sign }} {% raw %} about the Leo Sun" in client.calls[0].prompt
