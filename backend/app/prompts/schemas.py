"""Request/response models of the admin prompts API (``/api/v1/admin/prompts``)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import PromptVersion
from app.utils import supported_locales

TEMPLATE_MAX_LENGTH = 20_000
SYSTEM_INSTRUCTION_MAX_LENGTH = 10_000
SECTION_TITLE_MAX_LENGTH = 300
NOTES_MAX_LENGTH = 5_000


def _clean_section_titles(value: dict[str, str] | None) -> dict[str, str] | None:
    """Keep supported locales only (unknown ones are rejected) and drop empty titles."""
    if value is None:
        return None
    locales = set(supported_locales())
    unknown = sorted(set(value) - locales)
    if unknown:
        raise ValueError(f"unsupported locale(s): {', '.join(unknown)}")
    cleaned = {locale: title.strip() for locale, title in value.items() if title and title.strip()}
    too_long = [locale for locale, title in cleaned.items() if len(title) > SECTION_TITLE_MAX_LENGTH]
    if too_long:
        raise ValueError(f"title too long (max {SECTION_TITLE_MAX_LENGTH} characters): {', '.join(too_long)}")
    return cleaned


class _PromptFields(BaseModel):
    """Editable fields. Omitted fields are left unchanged (or copied from the base version)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=200)
    section_titles: dict[str, str] | None = None
    template: str | None = Field(default=None, min_length=1, max_length=TEMPLATE_MAX_LENGTH)
    system_instruction: str | None = Field(default=None, max_length=SYSTEM_INSTRUCTION_MAX_LENGTH)
    # Explicit null means "use the global min_words setting".
    min_words: int | None = Field(default=None, ge=0, le=5000)
    notes: str | None = Field(default=None, max_length=NOTES_MAX_LENGTH)

    @field_validator("section_titles")
    @classmethod
    def _check_titles(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        return _clean_section_titles(value)

    def provided(self) -> dict[str, Any]:
        """Fields present in the request body (``min_words: null`` counts as provided)."""
        values = self.model_dump(include=self.model_fields_set)
        values.pop("base_version_id", None)
        # name/template/system_instruction/notes/section_titles cannot be cleared with null.
        return {k: v for k, v in values.items() if v is not None or k == "min_words"}


class PromptDraftCreate(_PromptFields):
    """New draft for a slot. Fields not given are copied from ``base_version_id`` or, by default,
    from the slot's published version (else its latest version)."""

    base_version_id: int | None = Field(default=None, ge=1)


class PromptDraftUpdate(_PromptFields):
    pass


class PromptVersionOut(BaseModel):
    id: int
    slot: int
    version: int
    name: str
    section_titles: dict[str, str]
    template: str
    system_instruction: str
    min_words: int | None
    status: str
    notes: str
    created_by_id: int | None
    created_by_name: str | None
    created_at: datetime
    published_at: datetime | None

    @classmethod
    def from_model(cls, version: PromptVersion, creator_names: dict[int, str] | None = None) -> PromptVersionOut:
        names = creator_names or {}
        return cls(
            id=version.id,
            slot=version.slot,
            version=version.version,
            name=version.name,
            section_titles={k: v for k, v in (version.section_titles or {}).items() if isinstance(v, str)},
            template=version.template,
            system_instruction=version.system_instruction,
            min_words=version.min_words,
            status=version.status.value,
            notes=version.notes,
            created_by_id=version.created_by_id,
            created_by_name=names.get(version.created_by_id) if version.created_by_id else None,
            created_at=version.created_at,
            published_at=version.published_at,
        )


class SlotSummary(BaseModel):
    slot: int
    published: PromptVersionOut | None
    draft: PromptVersionOut | None
    versions_count: int


class SlotsOut(BaseModel):
    slots: list[SlotSummary]


class VersionsPage(BaseModel):
    items: list[PromptVersionOut]
    total: int
    page: int
    page_size: int


class LocaleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    locale: str | None = Field(default=None, max_length=16)


class PreviewIn(LocaleIn):
    """Preview a saved version, or unsaved editor text when ``template``/``system_instruction`` are given."""

    template: str | None = Field(default=None, min_length=1, max_length=TEMPLATE_MAX_LENGTH)
    system_instruction: str | None = Field(default=None, max_length=SYSTEM_INSTRUCTION_MAX_LENGTH)


class PreviewOut(BaseModel):
    locale: str
    rendered_prompt: str
    rendered_system_instruction: str | None


class PromptTestOut(BaseModel):
    output: str
    output_html: str
    word_count: int
    min_words: int
    model: str
    finish_reason: str | None


class VariableOut(BaseModel):
    name: str
    description: str
    example: Any


class VariablesOut(BaseModel):
    locale: str
    items: list[VariableOut]
