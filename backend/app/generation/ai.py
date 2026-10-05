"""AI text generation clients: Google Gemini (production) and a deterministic offline fake.

Callers depend on the ``AIClient`` protocol and pick an implementation with ``get_ai_client()``.
Errors are normalised to two exceptions so the job queue can decide what to do:

* ``AITransientError`` — try again later (timeouts, network errors, 408/429, 5xx).
* ``AIPermanentError`` — retrying will not help (bad request, auth, unknown model, configuration).

Only the rendered prompt and system instruction are sent; the customer's email address never is.
"""

from __future__ import annotations

import hashlib
import random
import re
import threading
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from typing import TYPE_CHECKING, Any, Protocol

from app.config import get_settings
from app.generation.words import count_words

if TYPE_CHECKING:
    from google.genai import Client as GenaiClient


@dataclass(frozen=True)
class AIResult:
    text: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    finish_reason: str | None = None


class AIError(Exception):
    """Base class of normalised AI client errors."""


class AITransientError(AIError):
    """Temporary failure: the same request may succeed later."""


class AIPermanentError(AIError):
    """The request cannot succeed without a change (prompt, model, credentials, configuration)."""


class AIConfigurationError(AIPermanentError):
    """The AI provider is not configured (e.g. missing API key)."""


class AIClient(Protocol):
    def generate(
        self,
        prompt: str,
        *,
        system_instruction: str | None,
        model: str,
        temperature: float,
        max_output_tokens: int,
        timeout_seconds: float,
    ) -> AIResult: ...


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

# 408 request timeout and 429 rate limiting are worth retrying; other 4xx are not.
_TRANSIENT_STATUS_CODES = frozenset({408, 429})


class GeminiClient:
    """``AIClient`` backed by the ``google-genai`` SDK (Gemini Developer API).

    The SDK's own retries are left disabled (its default): the durable job queue retries with
    backoff and keeps completed sections, which is safer for long multi-prompt jobs.
    """

    def __init__(self, api_key: str, *, client: GenaiClient | None = None) -> None:
        if not api_key and client is None:
            raise AIConfigurationError("Gemini API key is not configured (set ZB_GEMINI_API_KEY)")
        if client is None:
            from google import genai  # lazy: the SDK is heavy and only needed by the worker/admin test

            client = genai.Client(api_key=api_key)
        self._client = client

    def generate(
        self,
        prompt: str,
        *,
        system_instruction: str | None,
        model: str,
        temperature: float,
        max_output_tokens: int,
        timeout_seconds: float,
    ) -> AIResult:
        import httpx
        from google.genai import errors as genai_errors
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system_instruction or None,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)),  # SDK expects milliseconds
        )
        try:
            response = self._client.models.generate_content(model=model, contents=prompt, config=config)
        except genai_errors.APIError as exc:
            raise _classify_api_error(exc) from exc
        except httpx.TransportError as exc:  # timeouts, connection errors, protocol errors
            raise AITransientError(f"Gemini request failed: {type(exc).__name__}") from exc
        except genai_errors.UnknownApiResponseError as exc:
            raise AITransientError("Gemini returned an unreadable response") from exc
        return _result_from_response(response, model)


def _classify_api_error(exc: Any) -> AIError:
    code = getattr(exc, "code", None)
    status = getattr(exc, "status", None) or ""
    message = (getattr(exc, "message", None) or "").strip()[:300]
    text = f"Gemini API error {code} {status}: {message}".strip()
    if isinstance(code, int) and 400 <= code < 500 and code not in _TRANSIENT_STATUS_CODES:
        return AIPermanentError(text)
    return AITransientError(text)


def _result_from_response(response: Any, requested_model: str) -> AIResult:
    usage = getattr(response, "usage_metadata", None)
    candidates = getattr(response, "candidates", None) or []
    finish = getattr(candidates[0], "finish_reason", None) if candidates else None
    if finish is None and getattr(response, "prompt_feedback", None) is not None:
        reason = getattr(response.prompt_feedback, "block_reason", None)
        finish = f"BLOCKED_{getattr(reason, 'value', reason)}" if reason else None
    return AIResult(
        text=(response.text or "").strip(),
        model=getattr(response, "model_version", None) or requested_model,
        input_tokens=getattr(usage, "prompt_token_count", None) if usage else None,
        output_tokens=getattr(usage, "candidates_token_count", None) if usage else None,
        finish_reason=None if finish is None else str(getattr(finish, "value", finish)),
    )


# ---------------------------------------------------------------------------
# Fake (offline, deterministic)
# ---------------------------------------------------------------------------

_EN_HEADINGS = ("Your Inner Compass", "Where the Traditions Meet", "Strengths to Lean On", "A Path Forward")
_EN_SENTENCES = (
    "Your Western placements describe how you meet the world, while your Chinese pillars show the rhythm beneath it.",
    "The Sun points to the core of your identity and to the activities that make you feel most alive.",
    "Your Moon reveals what you need in order to feel safe, understood and emotionally nourished.",
    "The Ascendant colours first impressions and the instinctive style with which you begin new things.",
    "In the Chinese tradition, the year animal reflects how others tend to see you in public life.",
    "The month pillar speaks about family roots, early lessons and the way you build lasting habits.",
    "Your day pillar is often called the self, and its element shows the energy you naturally express.",
    "When the two traditions agree, the message is worth taking seriously and acting upon with confidence.",
    "When they differ, they invite you to balance two sides of a rich and layered personality.",
    "You learn best by doing, and experience slowly turns your intuition into dependable wisdom.",
    "Relationships thrive when you share your plans openly instead of carrying every burden alone.",
    "Periods of rest are not a weakness for you; they are the soil in which new ideas take root.",
    "Your curiosity is a gift, especially when it is guided by patience and a clear sense of purpose.",
    "Money and work flow more easily when you choose projects that match your genuine values.",
    "Small daily rituals help you stay grounded when life becomes busy, noisy or uncertain.",
    "Trust the quiet signals of your body, because they often notice change before your mind does.",
    "Friends value your loyalty, and your honesty gives them permission to be honest in return.",
    "The coming seasons favour steady growth, careful choices and generous collaboration with others.",
    "Creative expression, whether in art, conversation or problem solving, renews your inner fire.",
    "Remember that every chart describes potential, and your choices decide how that potential unfolds.",
)
_EN_BULLETS = ("Lead with warmth", "Protect your rest", "Choose depth over speed", "Celebrate small wins")

_AR_HEADINGS = ("بوصلتك الداخلية", "حيث تلتقي الحضارتان", "نقاط قوتك", "طريقك إلى الأمام")
_AR_SENTENCES = (
    "تصف مواقعك في الفلك الغربي طريقتك في مواجهة العالم، بينما تكشف أعمدتك الصينية الإيقاع العميق لحياتك.",
    "تشير الشمس إلى جوهر هويتك وإلى الأنشطة التي تجعلك تشعر بأنك أكثر حيوية.",
    "يكشف القمر ما تحتاج إليه لتشعر بالأمان والفهم والدفء العاطفي.",
    "يلوّن الطالع الانطباع الأول عنك والأسلوب الفطري الذي تبدأ به كل جديد.",
    "في التقليد الصيني يعكس حيوان السنة الصورة التي يراك بها الآخرون في الحياة العامة.",
    "يتحدث عمود الشهر عن الجذور العائلية والدروس الأولى وطريقتك في بناء العادات الراسخة.",
    "يُسمّى عمود اليوم غالبًا عمود الذات، ويُظهر عنصره الطاقة التي تعبّر عنها بطبيعتك.",
    "عندما تتفق الحضارتان تكون الرسالة جديرة بالاهتمام والعمل بها بثقة.",
    "وعندما تختلفان فإنهما تدعوانك إلى الموازنة بين جانبين من شخصية غنية ومتعددة الطبقات.",
    "أنت تتعلم بالممارسة، والتجربة تحوّل حدسك تدريجيًا إلى حكمة يمكن الاعتماد عليها.",
    "تزدهر علاقاتك عندما تشارك خططك بصراحة بدلًا من حمل كل الأعباء وحدك.",
    "فترات الراحة ليست ضعفًا لديك، بل هي التربة التي تنبت فيها الأفكار الجديدة.",
    "فضولك هبة حقيقية، خصوصًا عندما يقوده الصبر وإحساس واضح بالهدف.",
    "يتدفق المال والعمل بسهولة أكبر عندما تختار مشاريع تنسجم مع قيمك الحقيقية.",
    "تساعدك الطقوس اليومية الصغيرة على البقاء متوازنًا حين تصبح الحياة مزدحمة أو غامضة.",
    "ثق بالإشارات الهادئة لجسدك، فهي كثيرًا ما تلاحظ التغيير قبل أن يدركه عقلك.",
    "يقدّر أصدقاؤك وفاءك، وصدقك يمنحهم الإذن بأن يكونوا صادقين معك أيضًا.",
    "تفضّل المواسم القادمة النمو الثابت والاختيارات المدروسة والتعاون السخي مع الآخرين.",
    "التعبير الإبداعي، سواء في الفن أو الحديث أو حل المشكلات، يجدد نارك الداخلية.",
    "تذكّر أن كل خريطة تصف إمكانات، وأن اختياراتك هي التي تحدد كيف تتحقق هذه الإمكانات.",
)
_AR_BULLETS = ("ابدأ بالدفء", "احمِ وقت راحتك", "اختر العمق على السرعة", "احتفل بالإنجازات الصغيرة")

_ARABIC_SCRIPT = re.compile(r"[؀-ۿ]")
_ARABIC_WORD = re.compile(r"\barabic\b", re.IGNORECASE)


@dataclass(frozen=True)
class FakeCall:
    prompt: str
    system_instruction: str | None
    model: str
    temperature: float
    max_output_tokens: int
    timeout_seconds: float


FakeScriptItem = str | int | BaseException


class FakeAIClient:
    """Deterministic offline ``AIClient`` for development and tests.

    By default every call returns ~``target_words`` words of Markdown in the language the prompt asks
    for (Arabic when the prompt mentions "Arabic" or contains Arabic script, otherwise English); the
    same prompt always yields the same text. ``script`` overrides the next calls in order:
    a ``str`` is returned as the text, an ``int`` produces a reply of that many words, and an
    exception instance is raised. Every call is recorded in ``calls``.
    """

    model_name = "fake-gemini"

    def __init__(self, script: Iterable[FakeScriptItem] = (), *, target_words: int = 400) -> None:
        self._script: deque[FakeScriptItem] = deque(script)
        self._lock = threading.Lock()
        self.target_words = target_words
        self.calls: list[FakeCall] = []

    def generate(
        self,
        prompt: str,
        *,
        system_instruction: str | None,
        model: str,
        temperature: float,
        max_output_tokens: int,
        timeout_seconds: float,
    ) -> AIResult:
        with self._lock:
            self.calls.append(
                FakeCall(prompt, system_instruction, model, temperature, max_output_tokens, timeout_seconds)
            )
            item: FakeScriptItem | None = self._script.popleft() if self._script else None
        if isinstance(item, BaseException):
            raise item
        arabic = _wants_arabic(prompt, system_instruction)
        if isinstance(item, str):
            text = item
        else:
            text = fake_markdown(prompt, arabic=arabic, words=self.target_words if item is None else item)
        return AIResult(
            text=text,
            model=model or self.model_name,
            input_tokens=count_words(prompt) + count_words(system_instruction),
            output_tokens=count_words(text),
            finish_reason="STOP",
        )


def _wants_arabic(prompt: str, system_instruction: str | None) -> bool:
    combined = f"{system_instruction or ''}\n{prompt}"
    return bool(_ARABIC_WORD.search(combined) or _ARABIC_SCRIPT.search(prompt))


def fake_markdown(seed_text: str, *, arabic: bool, words: int = 400) -> str:
    """Plausible Markdown of exactly ``words`` words (0 => empty), deterministic for ``seed_text``."""
    if words <= 0:
        return ""
    rng = random.Random(hashlib.sha256(seed_text.encode("utf-8")).digest())
    headings, sentences, bullets = (
        (_AR_HEADINGS, _AR_SENTENCES, _AR_BULLETS) if arabic else (_EN_HEADINGS, _EN_SENTENCES, _EN_BULLETS)
    )
    tokens: list[str] = []
    blocks: list[str] = []
    paragraph: list[str] = []
    while len(tokens) < words:
        if not blocks and not paragraph:
            blocks.append(f"## {rng.choice(headings)}")
            tokens.extend(blocks[-1][3:].split())
            continue
        sentence = rng.choice(sentences)
        paragraph.append(sentence)
        tokens.extend(sentence.split())
        if len(paragraph) == 4:
            blocks.append(" ".join(paragraph))
            paragraph = []
            if rng.random() < 0.3:
                items = rng.sample(bullets, 2)
                blocks.append("\n".join(f"- **{item}**" for item in items))
                tokens.extend(" ".join(items).split())
    if paragraph:
        blocks.append(" ".join(paragraph))
    return _truncate_words("\n\n".join(blocks), words)


def _truncate_words(markdown: str, limit: int) -> str:
    """Cut ``markdown`` after ``limit`` words (whitespace-separated tokens), keeping its layout."""
    out: list[str] = []
    seen = 0
    for piece in re.split(r"(\s+)", markdown):
        if not piece or piece.isspace():
            out.append(piece)
            continue
        if seen >= limit:
            break
        seen += count_words(piece)
        out.append(piece)
    return "".join(out).rstrip()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


@lru_cache(maxsize=4)
def _gemini_client(api_key: str) -> GeminiClient:
    # One SDK client per key keeps HTTP connections pooled across jobs and threads.
    return GeminiClient(api_key)


def get_ai_client() -> AIClient:
    """The configured client (``ZB_AI_PROVIDER``). Raises ``AIConfigurationError`` if misconfigured."""
    settings = get_settings()
    if settings.ai_provider == "gemini":
        if not settings.gemini_api_key:
            raise AIConfigurationError("ZB_AI_PROVIDER=gemini requires ZB_GEMINI_API_KEY")
        return _gemini_client(settings.gemini_api_key)
    if settings.is_production:
        # Paying customers must never receive placeholder text.
        raise AIConfigurationError("ZB_AI_PROVIDER=fake is not allowed in production")
    return FakeAIClient()
