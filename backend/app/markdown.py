"""Safe Markdown -> HTML for admin-authored and AI-generated text.

Raw HTML in the source is disabled, and the output is additionally sanitised with nh3,
so neither editors nor model output can inject scripts into the site or the PDF.
"""

from __future__ import annotations

import nh3
from markdown_it import MarkdownIt

_md = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False}).enable("table")

_ALLOWED_TAGS = {
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "a",
    "code",
    "pre",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}
_ALLOWED_ATTRS = {"a": {"href", "title"}}


def render_markdown(source: str) -> str:
    html = _md.render(source or "")
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer nofollow",
    )
