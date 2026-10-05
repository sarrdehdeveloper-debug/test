"""The 6 versioned analysis prompts: lookup for the generator and draft/publish workflow for admins.

Each slot (1..6, the order of sections in the report) has at most one ``published`` version
(partial unique index), at most one ``draft`` (enforced here to keep the dashboard simple), and
any number of ``archived`` versions. Orders snapshot the published version ids they use.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ApiError, not_found
from app.generation.templating import PromptTemplateError, sample_variables, validate_template
from app.models import AdminUser, PromptStatus, PromptVersion
from app.prompts.schemas import PromptDraftCreate, PromptDraftUpdate
from app.utils import utcnow

PROMPT_SLOTS: tuple[int, ...] = (1, 2, 3, 4, 5, 6)

VARIABLE_DESCRIPTIONS: dict[str, str] = {
    "language": "Name of the report language in English, e.g. 'Arabic' — ask the model to answer in it",
    "locale": "Report locale code, e.g. 'ar'",
    "name": "Name the customer entered for the report (may be empty)",
    "sun_sign": "Western Sun sign",
    "sun_degree": "Degree of the Sun within its sign (0-30)",
    "moon_sign": "Western Moon sign",
    "moon_degree": "Degree of the Moon within its sign (0-30)",
    "ascendant": "Western rising sign (Ascendant)",
    "ascendant_degree": "Degree of the Ascendant within its sign (0-30)",
    "sun_on_cusp": "True when the Sun is within 1 degree of a sign boundary",
    "year_animal": "Chinese zodiac animal of the year pillar",
    "year_element": "Element of the year pillar's heavenly stem",
    "year_polarity": "Yin or Yang of the year pillar",
    "year_pillar": "Year pillar in Chinese characters (stem + branch)",
    "month_animal": "Animal of the month pillar",
    "month_element": "Element of the month pillar",
    "month_pillar": "Month pillar in Chinese characters",
    "day_animal": "Animal of the day pillar",
    "day_element": "Element of the day pillar",
    "day_pillar": "Day pillar in Chinese characters",
    "hour_animal": "Animal of the hour pillar",
    "hour_element": "Element of the hour pillar",
    "hour_pillar": "Hour pillar in Chinese characters",
    "day_master": "Day Master (polarity + element of the day stem), e.g. 'Yin Wood'",
}


# ---------------------------------------------------------------------------
# Used by the report generator
# ---------------------------------------------------------------------------


def published_versions(db: Session) -> dict[int, PromptVersion]:
    """The currently published version of each slot that has one: ``{slot: PromptVersion}``."""
    rows = db.scalars(select(PromptVersion).where(PromptVersion.status == PromptStatus.PUBLISHED))
    return {version.slot: version for version in rows}


# ---------------------------------------------------------------------------
# Admin queries
# ---------------------------------------------------------------------------


def get_version(db: Session, version_id: int) -> PromptVersion:
    version = db.get(PromptVersion, version_id)
    if version is None:
        raise not_found("prompt version")
    return version


def slot_overview(db: Session) -> list[dict[str, Any]]:
    """Per slot: published version, draft and number of versions."""
    counts = {
        slot: count for slot, count in db.execute(select(PromptVersion.slot, func.count()).group_by(PromptVersion.slot))
    }
    current = db.scalars(
        select(PromptVersion).where(PromptVersion.status.in_([PromptStatus.PUBLISHED, PromptStatus.DRAFT]))
    ).all()
    overview = {
        slot: {"slot": slot, "published": None, "draft": None, "versions_count": counts.get(slot, 0)}
        for slot in PROMPT_SLOTS
    }
    for version in current:
        overview[version.slot][version.status.value] = version
    return [overview[slot] for slot in PROMPT_SLOTS]


def list_versions(db: Session, slot: int, *, page: int, page_size: int) -> tuple[list[PromptVersion], int]:
    total = db.scalar(select(func.count()).select_from(PromptVersion).where(PromptVersion.slot == slot)) or 0
    items = db.scalars(
        select(PromptVersion)
        .where(PromptVersion.slot == slot)
        .order_by(PromptVersion.version.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return list(items), total


def creator_names(db: Session, versions: list[PromptVersion]) -> dict[int, str]:
    ids = {v.created_by_id for v in versions if v.created_by_id}
    if not ids:
        return {}
    rows = db.execute(select(AdminUser.id, AdminUser.name, AdminUser.email).where(AdminUser.id.in_(ids)))
    return {row.id: row.name or row.email for row in rows}


def describe_variables(locale: str) -> list[dict[str, Any]]:
    examples = sample_variables(locale)
    return [
        {"name": name, "description": VARIABLE_DESCRIPTIONS.get(name, ""), "example": example}
        for name, example in examples.items()
    ]


# ---------------------------------------------------------------------------
# Admin mutations (callers record the audit entry and commit)
# ---------------------------------------------------------------------------


def check_template(text: str | None, field: str) -> None:
    """Raise 422 ``invalid_template`` if ``text`` does not render with the sample variables."""
    if not text:
        return
    try:
        validate_template(text)
    except PromptTemplateError as exc:
        raise ApiError(422, "invalid_template", str(exc), {"field": field}) from exc


def create_draft(db: Session, slot: int, data: PromptDraftCreate, user: AdminUser) -> PromptVersion:
    """New draft with version ``max(version) + 1``; 409 ``draft_exists`` if the slot already has one."""
    slot_versions = _lock_slot(db, slot)
    if any(v.status == PromptStatus.DRAFT for v in slot_versions):
        raise ApiError(409, "draft_exists", "This prompt already has a draft; edit or publish it first")

    base = _base_version(db, slot, slot_versions, data.base_version_id)
    fields = data.provided()
    template = fields.get("template", base.template if base else None)
    if not template:
        raise ApiError(422, "template_required", "A template is required for the first version of a prompt")
    next_version = max((v.version for v in slot_versions), default=0) + 1
    draft = PromptVersion(
        slot=slot,
        version=next_version,
        name=fields.get("name", base.name if base else f"Section {slot}"),
        section_titles=fields.get("section_titles", dict(base.section_titles) if base else {}),
        template=template,
        system_instruction=fields.get("system_instruction", base.system_instruction if base else ""),
        min_words=fields.get("min_words", base.min_words if base else None),
        notes=fields.get("notes", ""),
        status=PromptStatus.DRAFT,
        created_by_id=user.id,
    )
    check_template(draft.template, "template")
    check_template(draft.system_instruction, "system_instruction")
    db.add(draft)
    try:
        db.flush()
    except IntegrityError as exc:  # a concurrent request created a version for this slot first
        db.rollback()
        raise ApiError(409, "draft_exists", "This prompt was changed concurrently; reload and retry") from exc
    return draft


def update_draft(db: Session, version: PromptVersion, data: PromptDraftUpdate) -> list[str]:
    """Apply the given fields to a draft (409 ``not_draft`` otherwise). Returns the changed field names."""
    _ensure_draft(version)
    fields = data.provided()
    check_template(fields.get("template"), "template")
    check_template(fields.get("system_instruction"), "system_instruction")
    changed = []
    for name, value in fields.items():
        if getattr(version, name) != value:
            setattr(version, name, value)
            changed.append(name)
    db.flush()
    return changed


def delete_draft(db: Session, version: PromptVersion) -> None:
    _ensure_draft(version)
    db.delete(version)
    db.flush()


def publish_version(db: Session, version: PromptVersion) -> PromptVersion | None:
    """Publish ``version`` (a draft, or an archived one to roll back) and archive the current one.

    Returns the previously published version, or ``None`` if there was none or ``version`` was
    already published (no-op).
    """
    slot_versions = _lock_slot(db, version.slot)
    if version.status == PromptStatus.PUBLISHED:
        return None
    check_template(version.template, "template")
    check_template(version.system_instruction, "system_instruction")
    previous = next((v for v in slot_versions if v.status == PromptStatus.PUBLISHED), None)
    if previous is not None:
        # Archive first and flush: the partial unique index allows one published row per slot.
        previous.status = PromptStatus.ARCHIVED
        db.flush()
    version.status = PromptStatus.PUBLISHED
    version.published_at = utcnow()
    db.flush()
    return previous


def _lock_slot(db: Session, slot: int) -> list[PromptVersion]:
    """Lock (and reload) every version of a slot so concurrent create/publish requests serialise."""
    stmt = (
        select(PromptVersion)
        .where(PromptVersion.slot == slot)
        .order_by(PromptVersion.version)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return list(db.scalars(stmt).all())


def _base_version(
    db: Session, slot: int, slot_versions: list[PromptVersion], base_version_id: int | None
) -> PromptVersion | None:
    if base_version_id is not None:
        base = db.get(PromptVersion, base_version_id)
        if base is None or base.slot != slot:
            raise ApiError(422, "invalid_base_version", "base_version_id must be a version of the same prompt")
        return base
    published = next((v for v in slot_versions if v.status == PromptStatus.PUBLISHED), None)
    return published or (slot_versions[-1] if slot_versions else None)


def _ensure_draft(version: PromptVersion) -> None:
    if version.status != PromptStatus.DRAFT:
        raise ApiError(409, "not_draft", "Only drafts can be changed; create a new draft instead")
