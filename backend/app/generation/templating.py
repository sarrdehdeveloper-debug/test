"""Prompt templates: sandboxed Jinja2 rendered with variables derived from a chart.

Admins edit templates in the dashboard, so rendering uses a ``SandboxedEnvironment`` with
``StrictUndefined`` (a typo in a variable name is reported instead of silently blank).
"""

from __future__ import annotations

from typing import Any

from jinja2 import StrictUndefined, TemplateError
from jinja2.sandbox import SandboxedEnvironment

from app.charts.schemas import Chart

_env = SandboxedEnvironment(undefined=StrictUndefined, autoescape=False, trim_blocks=True, lstrip_blocks=True)

LANGUAGE_NAMES = {
    "en": "English",
    "ar": "Arabic",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "tr": "Turkish",
    "zh": "Chinese (Simplified)",
    "ru": "Russian",
    "pt": "Portuguese",
    "it": "Italian",
}


class PromptTemplateError(ValueError):
    pass


def _title(value: str) -> str:
    return value.replace("_", " ").title()


def chart_variables(chart: Chart | dict[str, Any], locale: str, display_name: str | None = None) -> dict[str, Any]:
    """Variables available in prompt templates. Documented in docs/ARCHITECTURE.md."""
    c = chart if isinstance(chart, Chart) else Chart.model_validate(chart)
    w, z = c.western, c.chinese
    return {
        "language": LANGUAGE_NAMES.get(locale, locale),
        "locale": locale,
        "name": display_name or "",
        "sun_sign": _title(w.sun.sign),
        "sun_degree": round(w.sun.degree_in_sign, 1),
        "moon_sign": _title(w.moon.sign),
        "moon_degree": round(w.moon.degree_in_sign, 1),
        "ascendant": _title(w.ascendant.sign),
        "ascendant_degree": round(w.ascendant.degree_in_sign, 1),
        "sun_on_cusp": w.sun_on_cusp,
        "year_animal": _title(z.year.animal),
        "year_element": _title(z.year.element),
        "year_polarity": _title(z.year.polarity),
        "year_pillar": f"{z.year.stem}{z.year.branch}",
        "month_animal": _title(z.month.animal),
        "month_element": _title(z.month.element),
        "month_pillar": f"{z.month.stem}{z.month.branch}",
        "day_animal": _title(z.day.animal),
        "day_element": _title(z.day.element),
        "day_pillar": f"{z.day.stem}{z.day.branch}",
        "hour_animal": _title(z.hour.animal),
        "hour_element": _title(z.hour.element),
        "hour_pillar": f"{z.hour.stem}{z.hour.branch}",
        "day_master": f"{_title(z.day.polarity)} {_title(z.day.element)}",
    }


def sample_variables(locale: str = "en") -> dict[str, Any]:
    """Example variables for previewing templates in the dashboard."""
    return {
        "language": LANGUAGE_NAMES.get(locale, locale),
        "locale": locale,
        "name": "Alex",
        "sun_sign": "Leo",
        "sun_degree": 24.3,
        "moon_sign": "Pisces",
        "moon_degree": 3.8,
        "ascendant": "Scorpio",
        "ascendant_degree": 17.2,
        "sun_on_cusp": False,
        "year_animal": "Horse",
        "year_element": "Metal",
        "year_polarity": "Yang",
        "year_pillar": "庚午",
        "month_animal": "Monkey",
        "month_element": "Earth",
        "month_pillar": "甲申",
        "day_animal": "Rabbit",
        "day_element": "Wood",
        "day_pillar": "乙卯",
        "hour_animal": "Dragon",
        "hour_element": "Fire",
        "hour_pillar": "庚辰",
        "day_master": "Yin Wood",
    }


def validate_template(template: str) -> None:
    """Raise PromptTemplateError if the template does not parse or uses unknown variables."""
    render_prompt(template, sample_variables())


def render_prompt(template: str, variables: dict[str, Any]) -> str:
    try:
        return _env.from_string(template).render(**variables).strip()
    except TemplateError as exc:  # includes UndefinedError, TemplateSyntaxError, SecurityError
        raise PromptTemplateError(str(exc)) from exc
