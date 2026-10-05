"""``generate_report`` job: produce the 6 AI sections of a paid report, then build the PDF.

Flow (see docs/ARCHITECTURE.md, "Order & report lifecycle"):

1. Take a PostgreSQL advisory lock for the order so two workers never generate it concurrently
   (a job whose lease expired can be re-claimed while the first worker is still running).
2. Skip orders that are not waiting for a report (awaiting payment, ready, expired, refunded,
   abandoned); ``generation_failed`` orders are processed so an admin retry works.
3. Mark the order ``generating`` and snapshot the published prompt versions on the first run.
4. For slots 1..6: reuse finished sections; otherwise call the AI, re-asking while the reply is
   shorter than ``min_words`` (up to ``max_attempts_per_prompt`` calls), pausing a random
   ``prompt_delay_min..max`` seconds between any two AI calls, and persist each section at once.
5. Call ``app.reports.service.build_report``.

Transient AI errors propagate so the worker retries the job with backoff; finished sections are
kept. Permanent problems mark the order ``generation_failed`` and raise ``PermanentJobError``.
"""

from __future__ import annotations

import logging
import random
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import Connection, Engine, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.generation import ai
from app.generation.service import (
    REPORT_SLOTS,
    GenerationSettings,
    RenderedPrompt,
    call_ai,
    load_generation_settings,
    min_words_for,
    render_version,
    section_title,
)
from app.generation.templating import PromptTemplateError, chart_variables
from app.generation.words import count_words
from app.jobs.registry import PermanentJobError
from app.models import Job, Order, OrderStatus, PromptVersion, ReportSection, SectionStatus
from app.prompts.service import published_versions
from app.utils import utcnow

log = logging.getLogger("zb.generation")

# Indirection so tests can replace the pause between AI calls.
_sleep = time.sleep

# Orders in these states are (still) waiting for their report; anything else is skipped.
RUNNABLE_STATUSES = frozenset(
    {OrderStatus.PAID, OrderStatus.QUEUED, OrderStatus.GENERATING, OrderStatus.GENERATION_FAILED}
)
PROMPTS_NOT_CONFIGURED = "prompts_not_configured"
_ERROR_TEXT_LIMIT = 2000


class OrderBusyError(Exception):
    """Another worker holds this order's generation lock; the job is retried later."""


def handle_generate_report(db: Session, job: Job) -> None:
    """Job handler for ``generate_report`` (payload ``{"order_id": "<uuid>"}``)."""
    order_id = _order_id_from_payload(job.payload)
    is_last_attempt = job.attempts >= job.max_attempts
    with _order_generation_lock(db, order_id):
        try:
            _generate(db, job, order_id)
        except PermanentJobError as exc:
            _mark_generation_failed(db, order_id, str(exc))
            raise
        except ai.AIPermanentError as exc:
            message = f"ai_error: {exc}"
            _mark_generation_failed(db, order_id, message)
            raise PermanentJobError(message) from exc
        except ai.AITransientError as exc:
            if is_last_attempt:
                _mark_generation_failed(db, order_id, f"ai_unavailable: {exc}")
            raise
        except Exception as exc:
            if is_last_attempt:
                _mark_generation_failed(db, order_id, f"unexpected_error: {type(exc).__name__}")
            raise


def _generate(db: Session, job: Job, order_id: uuid.UUID) -> None:
    order = db.get(Order, order_id, with_for_update=True, populate_existing=True)
    if order is None:
        raise PermanentJobError("order_not_found")
    if order.status not in RUNNABLE_STATUSES:
        log.info("generate_report skipped: order %s is %s", order_id, order.status.value)
        db.commit()
        return
    _mark_generating(order)
    db.commit()

    versions = _prompt_versions(db, order)
    variables = _template_variables(order)
    settings = load_generation_settings(db)
    client = ai.get_ai_client()
    pacer = _Pacer(settings)

    def before_ai_call() -> None:
        pacer.wait()
        # A section may need several long calls, so the lease must cover each call, not only each section.
        _extend_lease(job)
        db.commit()

    existing = {s.slot: s for s in db.scalars(select(ReportSection).where(ReportSection.order_id == order.id))}

    for slot in REPORT_SLOTS:
        section = existing.get(slot)
        if section is not None and section.status == SectionStatus.DONE:
            continue  # finished sections are never regenerated
        if not _still_generating(db, order):
            log.info("generate_report stopped: order %s changed to %s", order_id, order.status.value)
            return
        section = _generate_section(db, client, before_ai_call, order, versions[slot], variables, settings, section)
        _extend_lease(job)
        db.commit()
        if section.status == SectionStatus.FAILED:
            raise PermanentJobError(f"section {slot}: {section.last_error}")

    _build_report(db, order)
    db.commit()


def _mark_generating(order: Order) -> None:
    if order.status != OrderStatus.GENERATING:
        # A new run (first run or an admin retry): restart the clock and clear the old error.
        order.generation_started_at = utcnow()
        order.last_error = None
    order.status = OrderStatus.GENERATING


def _prompt_versions(db: Session, order: Order) -> dict[int, PromptVersion]:
    """The prompt versions for this order, snapshotting the published ones on the first run.

    The snapshot keeps a retried order consistent even if admins publish new prompts meanwhile.
    """
    if not order.prompt_version_ids:
        published = published_versions(db)
        missing = [slot for slot in REPORT_SLOTS if slot not in published]
        if missing:
            log.error("generate_report: no published prompt for slots %s (order %s)", missing, order.id)
            raise PermanentJobError(PROMPTS_NOT_CONFIGURED)
        order.prompt_version_ids = [published[slot].id for slot in REPORT_SLOTS]
        db.commit()
        return {slot: published[slot] for slot in REPORT_SLOTS}

    ids = list(order.prompt_version_ids)
    by_id = {v.id: v for v in db.scalars(select(PromptVersion).where(PromptVersion.id.in_(ids)))}
    versions: dict[int, PromptVersion] = {}
    for slot, version_id in zip(REPORT_SLOTS, ids, strict=False):
        version = by_id.get(version_id)
        if version is None or version.slot != slot:
            raise PermanentJobError(f"prompt_version_missing: slot {slot}")
        versions[slot] = version
    if len(versions) != len(REPORT_SLOTS):
        raise PermanentJobError("prompt_version_missing: incomplete snapshot")
    return versions


def _template_variables(order: Order) -> dict[str, Any]:
    try:
        return chart_variables(order.chart, order.locale, order.display_name)
    except ValidationError as exc:
        raise PermanentJobError("invalid_chart") from exc


def _still_generating(db: Session, order: Order) -> bool:
    """Stop if the order changed meanwhile (e.g. refunded while we were generating)."""
    db.refresh(order, attribute_names=["status"])
    return order.status == OrderStatus.GENERATING


def _generate_section(
    db: Session,
    client: ai.AIClient,
    before_ai_call: Callable[[], None],
    order: Order,
    version: PromptVersion,
    variables: dict[str, Any],
    settings: GenerationSettings,
    section: ReportSection | None,
) -> ReportSection:
    slot = version.slot
    try:
        rendered: RenderedPrompt = render_version(version, variables)
    except PromptTemplateError as exc:
        raise PermanentJobError(f"invalid_template: slot {slot} (prompt version {version.id})") from exc
    # An empty reply is never acceptable, even if min_words is configured as 0.
    required_words = max(1, min_words_for(version, settings))

    attempts = 0
    words = 0
    tokens = _TokenTotals()
    result: ai.AIResult | None = None
    while attempts < settings.max_attempts_per_prompt:
        before_ai_call()
        attempts += 1
        result = call_ai(client, rendered, settings)
        tokens.add(result)
        words = count_words(result.text)
        if words >= required_words:
            break
        log.info(
            "order %s slot %s: reply too short (%s < %s words), attempt %s/%s",
            order.id,
            slot,
            words,
            required_words,
            attempts,
            settings.max_attempts_per_prompt,
        )
    assert result is not None  # max_attempts_per_prompt >= 1

    if section is None:
        section = ReportSection(order_id=order.id, slot=slot)
        db.add(section)
    section.prompt_version_id = version.id
    section.title = section_title(version, order.locale)
    section.content = result.text
    section.word_count = words
    section.attempts = attempts
    section.model = result.model[:100]
    section.input_tokens = tokens.input_tokens
    section.output_tokens = tokens.output_tokens
    if words >= required_words:
        section.status = SectionStatus.DONE
        section.last_error = None
    else:
        section.status = SectionStatus.FAILED
        section.last_error = f"reply too short after {attempts} attempts ({words} < {required_words} words)"
    return section


class _TokenTotals:
    """Token usage summed over all attempts of a section (every call is billed)."""

    def __init__(self) -> None:
        self.input_tokens: int | None = None
        self.output_tokens: int | None = None

    def add(self, result: ai.AIResult) -> None:
        if result.input_tokens is not None:
            self.input_tokens = (self.input_tokens or 0) + result.input_tokens
        if result.output_tokens is not None:
            self.output_tokens = (self.output_tokens or 0) + result.output_tokens


class _Pacer:
    """Sleeps a random ``prompt_delay_min..max`` seconds before every AI call except the first."""

    def __init__(self, settings: GenerationSettings) -> None:
        self._low = settings.delay_min_seconds
        self._high = settings.delay_max_seconds
        self._calls = 0

    def wait(self) -> None:
        if self._calls:
            _sleep(random.uniform(self._low, self._high))
        self._calls += 1


def _extend_lease(job: Job) -> None:
    job.locked_until = utcnow() + timedelta(seconds=get_settings().job_lease_seconds)


def _build_report(db: Session, order: Order) -> None:
    # Imported lazily: the reports module pulls in PDF rendering (Playwright) dependencies.
    from app.reports.service import build_report

    build_report(db, order)


def _mark_generation_failed(db: Session, order_id: uuid.UUID, message: str) -> None:
    """Persist ``generation_failed`` in its own transaction (the worker rolls back after errors)."""
    try:
        db.rollback()
        order = db.get(Order, order_id, with_for_update=True, populate_existing=True)
        if order is not None and order.status in RUNNABLE_STATUSES:
            order.status = OrderStatus.GENERATION_FAILED
            order.last_error = message[:_ERROR_TEXT_LIMIT]
        db.commit()
    except Exception:
        log.exception("could not mark order %s as generation_failed", order_id)
        db.rollback()


def _order_id_from_payload(payload: dict[str, Any] | None) -> uuid.UUID:
    try:
        return uuid.UUID(str((payload or {}).get("order_id")))
    except (TypeError, ValueError) as exc:
        raise PermanentJobError("invalid job payload: order_id") from exc


@contextmanager
def _order_generation_lock(db: Session, order_id: uuid.UUID) -> Iterator[None]:
    """Hold ``pg_try_advisory_lock`` for the order on a dedicated connection.

    A session-level advisory lock belongs to one database connection, but the ORM session returns
    its connection to the pool on every commit, so the lock lives on its own autocommit connection.
    If the process dies, PostgreSQL releases the lock with the connection.
    """
    bind = db.get_bind()
    engine = bind if isinstance(bind, Engine) else bind.engine
    key = f"generate_report:{order_id}"
    conn = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        if not conn.scalar(text("SELECT pg_try_advisory_lock(hashtext(:key))"), {"key": key}):
            raise OrderBusyError(f"order {order_id} is being generated by another worker")
        try:
            yield
        finally:
            _release_lock(conn, key)
    finally:
        conn.close()


def _release_lock(conn: Connection, key: str) -> None:
    try:
        conn.scalar(text("SELECT pg_advisory_unlock(hashtext(:key))"), {"key": key})
    except Exception:
        log.exception("could not release generation lock %s", key)
        conn.invalidate()  # never hand a connection that may still hold the lock back to the pool
