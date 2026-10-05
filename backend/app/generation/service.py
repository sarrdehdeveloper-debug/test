"""Building blocks shared by the report generation job and the admin prompt tester."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.generation.ai import AIClient, AIResult
from app.generation.templating import render_prompt
from app.generation.words import count_words
from app.models import PromptVersion, ReportSection, SectionStatus
from app.settings_store import get_all_settings
from app.utils import default_locale

REPORT_SLOTS: tuple[int, ...] = (1, 2, 3, 4, 5, 6)
SECTIONS_TOTAL = len(REPORT_SLOTS)
_TITLE_MAX_LENGTH = 300  # report_sections.title column size


@dataclass(frozen=True)
class GenerationSettings:
    """Runtime settings (``settings_store``) used for every AI call of one job run."""

    model: str
    temperature: float
    max_output_tokens: int
    timeout_seconds: float
    min_words: int
    max_attempts_per_prompt: int
    delay_min_seconds: float
    delay_max_seconds: float


def load_generation_settings(db: Session) -> GenerationSettings:
    values = get_all_settings(db)
    delay_a, delay_b = float(values["prompt_delay_min_seconds"]), float(values["prompt_delay_max_seconds"])
    return GenerationSettings(
        model=str(values["gemini_model"]),
        temperature=float(values["gemini_temperature"]),
        max_output_tokens=int(values["gemini_max_output_tokens"]),
        timeout_seconds=float(values["gemini_timeout_seconds"]),
        min_words=int(values["min_words"]),
        max_attempts_per_prompt=max(1, int(values["max_attempts_per_prompt"])),
        delay_min_seconds=min(delay_a, delay_b),
        delay_max_seconds=max(delay_a, delay_b),
    )


def min_words_for(version: PromptVersion, settings: GenerationSettings) -> int:
    """A version's own ``min_words`` overrides the global setting."""
    return settings.min_words if version.min_words is None else version.min_words


def section_title(version: PromptVersion, locale: str) -> str:
    """Localised section heading: requested locale, then default locale, then any, then the name."""
    titles: dict[str, Any] = version.section_titles or {}
    for candidate in (locale, default_locale()):
        value = titles.get(candidate)
        if isinstance(value, str) and value.strip():
            return value.strip()[:_TITLE_MAX_LENGTH]
    for value in titles.values():
        if isinstance(value, str) and value.strip():
            return value.strip()[:_TITLE_MAX_LENGTH]
    return version.name[:_TITLE_MAX_LENGTH]


@dataclass(frozen=True)
class RenderedPrompt:
    prompt: str
    system_instruction: str | None


def render_version(version: PromptVersion, variables: dict[str, Any]) -> RenderedPrompt:
    """Render a version's template and system instruction (both may use the template variables).

    Raises ``templating.PromptTemplateError`` on an invalid template.
    """
    system = render_prompt(version.system_instruction, variables) if version.system_instruction else ""
    return RenderedPrompt(prompt=render_prompt(version.template, variables), system_instruction=system or None)


def call_ai(client: AIClient, rendered: RenderedPrompt, settings: GenerationSettings) -> AIResult:
    return client.generate(
        rendered.prompt,
        system_instruction=rendered.system_instruction,
        model=settings.model,
        temperature=settings.temperature,
        max_output_tokens=settings.max_output_tokens,
        timeout_seconds=settings.timeout_seconds,
    )


@dataclass(frozen=True)
class PromptTestResult:
    output: str
    word_count: int
    min_words: int
    model: str
    finish_reason: str | None


def run_prompt_test(
    db: Session, client: AIClient, version: PromptVersion, variables: dict[str, Any]
) -> PromptTestResult:
    """Single AI call with ``variables`` (no retries, no pauses) for the admin "test" button."""
    settings = load_generation_settings(db)
    result = call_ai(client, render_version(version, variables), settings)
    return PromptTestResult(
        output=result.text,
        word_count=count_words(result.text),
        min_words=min_words_for(version, settings),
        model=result.model,
        finish_reason=result.finish_reason,
    )


def count_done_sections(db: Session, order_id: Any) -> int:
    """Number of finished sections of an order (for progress displays)."""
    return (
        db.scalar(
            select(func.count())
            .select_from(ReportSection)
            .where(ReportSection.order_id == order_id, ReportSection.status == SectionStatus.DONE)
        )
        or 0
    )
