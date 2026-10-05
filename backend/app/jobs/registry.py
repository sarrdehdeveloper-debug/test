"""Maps job kinds to handler callables ``handler(db: Session, job: Job) -> None``.

Handlers run inside a transaction opened by the worker; they may commit intermediate
progress themselves (e.g. after each generated section). Raise ``PermanentJobError`` for
errors that must not be retried; any other exception schedules a retry with backoff.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.jobs import queue
from app.models import Job

Handler = Callable[[Session, Job], None]


class PermanentJobError(Exception):
    """Raise from a handler to fail the job without further retries."""


_HANDLERS: dict[str, str] = {
    queue.GENERATE_REPORT: "app.generation.jobs:handle_generate_report",
    queue.SEND_REPORT_EMAIL: "app.reports.jobs:handle_send_report_email",
    queue.CLEANUP: "app.reports.jobs:handle_cleanup",
}


def get_handler(kind: str) -> Handler:
    target = _HANDLERS.get(kind)
    if target is None:
        raise PermanentJobError(f"No handler for job kind {kind!r}")
    module_name, attr = target.split(":")
    return getattr(importlib.import_module(module_name), attr)
