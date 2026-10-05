"""Admin API for the 6 analysis prompts (mounted at ``/api/v1/admin/prompts``, managers only)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from sqlalchemy.orm import Session

from app import audit
from app.admin_auth.deps import require_manager
from app.db import get_db
from app.errors import ApiError
from app.generation import ai
from app.generation.service import RenderedPrompt, run_prompt_test
from app.generation.templating import PromptTemplateError, render_prompt, sample_variables
from app.markdown import render_markdown
from app.models import AdminUser, PromptStatus, PromptVersion
from app.prompts import service
from app.prompts.schemas import (
    LocaleIn,
    PreviewIn,
    PreviewOut,
    PromptDraftCreate,
    PromptDraftUpdate,
    PromptTestOut,
    PromptVersionOut,
    SlotsOut,
    SlotSummary,
    VariableOut,
    VariablesOut,
    VersionsPage,
)
from app.ratelimit import limiter
from app.utils import client_ip, normalize_locale

router = APIRouter()

ENTITY = "prompt_version"
TEST_RATE_LIMIT = 10  # AI test calls per admin ...
TEST_RATE_WINDOW_SECONDS = 60  # ... per minute (each call costs money)

Slot = Annotated[int, Path(ge=1, le=6, description="Prompt slot 1..6 (order of the report sections)")]


def _out(db: Session, version: PromptVersion) -> PromptVersionOut:
    return PromptVersionOut.from_model(version, service.creator_names(db, [version]))


@router.get("", response_model=SlotsOut)
def list_slots(db: Session = Depends(get_db), _user: AdminUser = Depends(require_manager)) -> SlotsOut:
    overview = service.slot_overview(db)
    versions = [v for row in overview for v in (row["published"], row["draft"]) if v is not None]
    names = service.creator_names(db, versions)

    def dump(version: PromptVersion | None) -> PromptVersionOut | None:
        return None if version is None else PromptVersionOut.from_model(version, names)

    return SlotsOut(
        slots=[
            SlotSummary(
                slot=row["slot"],
                published=dump(row["published"]),
                draft=dump(row["draft"]),
                versions_count=row["versions_count"],
            )
            for row in overview
        ]
    )


@router.get("/variables", response_model=VariablesOut)
def list_variables(
    locale: str | None = Query(default=None, max_length=16), _user: AdminUser = Depends(require_manager)
) -> VariablesOut:
    loc = normalize_locale(locale)
    return VariablesOut(locale=loc, items=[VariableOut(**item) for item in service.describe_variables(loc)])


@router.get("/{slot}/versions", response_model=VersionsPage)
def list_slot_versions(
    slot: Slot,
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: AdminUser = Depends(require_manager),
) -> VersionsPage:
    items, total = service.list_versions(db, slot, page=page, page_size=page_size)
    names = service.creator_names(db, items)
    return VersionsPage(
        items=[PromptVersionOut.from_model(v, names) for v in items], total=total, page=page, page_size=page_size
    )


@router.post("/{slot}/versions", response_model=PromptVersionOut, status_code=201)
def create_draft(
    body: PromptDraftCreate,
    request: Request,
    slot: Slot,
    db: Session = Depends(get_db),
    user: AdminUser = Depends(require_manager),
) -> PromptVersionOut:
    draft = service.create_draft(db, slot, body, user)
    audit.record(
        db,
        user,
        "prompt.create_draft",
        ENTITY,
        draft.id,
        {"slot": slot, "version": draft.version, "base_version_id": body.base_version_id},
        ip=client_ip(request),
    )
    db.commit()
    return _out(db, draft)


@router.get("/versions/{version_id}", response_model=PromptVersionOut)
def get_version(
    version_id: int, db: Session = Depends(get_db), _user: AdminUser = Depends(require_manager)
) -> PromptVersionOut:
    return _out(db, service.get_version(db, version_id))


@router.patch("/versions/{version_id}", response_model=PromptVersionOut)
def update_draft(
    version_id: int,
    body: PromptDraftUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: AdminUser = Depends(require_manager),
) -> PromptVersionOut:
    version = service.get_version(db, version_id)
    changed = service.update_draft(db, version, body)
    if changed:
        audit.record(
            db,
            user,
            "prompt.update_draft",
            ENTITY,
            version.id,
            {"slot": version.slot, "version": version.version, "fields": changed},
            ip=client_ip(request),
        )
    db.commit()
    return _out(db, version)


@router.delete("/versions/{version_id}", status_code=204)
def delete_draft(
    version_id: int, request: Request, db: Session = Depends(get_db), user: AdminUser = Depends(require_manager)
) -> Response:
    version = service.get_version(db, version_id)
    details = {"slot": version.slot, "version": version.version}
    service.delete_draft(db, version)
    audit.record(db, user, "prompt.delete_draft", ENTITY, version_id, details, ip=client_ip(request))
    db.commit()
    return Response(status_code=204)


@router.post("/versions/{version_id}/publish", response_model=PromptVersionOut)
def publish_version(
    version_id: int, request: Request, db: Session = Depends(get_db), user: AdminUser = Depends(require_manager)
) -> PromptVersionOut:
    version = service.get_version(db, version_id)
    was_published = version.status == PromptStatus.PUBLISHED
    previous = service.publish_version(db, version)
    if not was_published:
        audit.record(
            db,
            user,
            "prompt.publish",
            ENTITY,
            version.id,
            {
                "slot": version.slot,
                "version": version.version,
                "archived_version_id": previous.id if previous else None,
            },
            ip=client_ip(request),
        )
    db.commit()
    return _out(db, version)


@router.post("/versions/{version_id}/preview", response_model=PreviewOut)
def preview_version(
    version_id: int,
    body: PreviewIn | None = None,
    db: Session = Depends(get_db),
    _user: AdminUser = Depends(require_manager),
) -> PreviewOut:
    body = body or PreviewIn()
    version = service.get_version(db, version_id)
    locale = normalize_locale(body.locale)
    variables = sample_variables(locale)
    template = body.template if body.template is not None else version.template
    system = body.system_instruction if body.system_instruction is not None else version.system_instruction
    rendered = _render_or_422(template, system, variables)
    return PreviewOut(
        locale=locale, rendered_prompt=rendered.prompt, rendered_system_instruction=rendered.system_instruction
    )


@router.post("/versions/{version_id}/test", response_model=PromptTestOut)
def test_version(
    version_id: int,
    request: Request,
    body: LocaleIn | None = None,
    db: Session = Depends(get_db),
    user: AdminUser = Depends(require_manager),
) -> PromptTestOut:
    """Run the prompt once against the configured AI with sample variables (sync: runs in a thread)."""
    limiter.hit(f"admin_prompt_test:{user.id}", TEST_RATE_LIMIT, TEST_RATE_WINDOW_SECONDS)
    version = service.get_version(db, version_id)
    locale = normalize_locale((body or LocaleIn()).locale)
    try:
        client = ai.get_ai_client()
        result = run_prompt_test(db, client, version, sample_variables(locale))
    except PromptTemplateError as exc:
        raise ApiError(422, "invalid_template", str(exc)) from exc
    except ai.AIConfigurationError as exc:
        raise ApiError(503, "ai_not_configured", str(exc)) from exc
    except ai.AITransientError as exc:
        raise ApiError(503, "ai_unavailable", f"The AI service is temporarily unavailable: {exc}") from exc
    except ai.AIPermanentError as exc:
        raise ApiError(502, "ai_error", str(exc)) from exc
    audit.record(
        db,
        user,
        "prompt.test",
        ENTITY,
        version.id,
        {"slot": version.slot, "version": version.version, "locale": locale, "word_count": result.word_count},
        ip=client_ip(request),
    )
    db.commit()
    return PromptTestOut(
        output=result.output,
        output_html=render_markdown(result.output),
        word_count=result.word_count,
        min_words=result.min_words,
        model=result.model,
        finish_reason=result.finish_reason,
    )


def _render_or_422(template: str, system_instruction: str, variables: dict[str, Any]) -> RenderedPrompt:
    try:
        prompt = render_prompt(template, variables)
        system = render_prompt(system_instruction, variables) if system_instruction else ""
    except PromptTemplateError as exc:
        raise ApiError(422, "invalid_template", str(exc)) from exc
    return RenderedPrompt(prompt=prompt, system_instruction=system or None)
