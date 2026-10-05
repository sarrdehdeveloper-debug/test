"""Jinja2 environment for the report PDF and email templates (autoescaping on for HTML)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


@lru_cache(maxsize=1)
def get_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATES_DIR),
        # Plain-text email templates (.txt) must not be HTML-escaped; everything else is.
        autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=True, default=False),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )


def render_template(name: str, **context: Any) -> str:
    return get_env().get_template(name).render(**context)


def read_template_file(name: str) -> str:
    """Raw file from the templates directory (e.g. the report stylesheet)."""
    return (TEMPLATES_DIR / name).read_text(encoding="utf-8")
