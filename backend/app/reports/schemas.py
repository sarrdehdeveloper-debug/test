"""Pydantic models of the reports module: job payloads and the PDF/email view models."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class OrderJobPayload(BaseModel):
    """Payload of jobs that act on one order (``send_report_email``)."""

    model_config = ConfigDict(extra="ignore")

    order_id: uuid.UUID


class Placement(BaseModel):
    """One Western point on the cover, e.g. Sun in Leo at 24°18′."""

    label: str
    sign: str
    degree: str


class PillarView(BaseModel):
    """One of the four Chinese pillars, e.g. Year 庚午 (gēng wǔ) Yang Metal Horse."""

    label: str
    characters: str
    pinyin: str
    description: str


class SectionView(BaseModel):
    number: int = Field(ge=1)
    label: str = Field(description='Eyebrow above the title, e.g. "Part 2 of 6"')
    title: str
    html: str = Field(description="Sanitised HTML from app.markdown.render_markdown")


class ReportView(BaseModel):
    """Everything the report template needs; built from an order and its sections."""

    locale: str
    direction: str
    text: dict[str, str]
    name: str | None
    generated_on: str
    placements: list[Placement]
    pillars: list[PillarView]
    day_master: str
    notes: list[str]
    sections: list[SectionView]


class EmailContent(BaseModel):
    subject: str
    text: str
    html: str


class CleanupResult(BaseModel):
    """Counts of what one cleanup run changed (logged by the worker)."""

    reports_expired: int = 0
    orders_abandoned: int = 0
    orders_purged: int = 0
    free_requests_purged: int = 0
    admin_sessions_deleted: int = 0
    login_attempts_deleted: int = 0
    jobs_deleted: int = 0
