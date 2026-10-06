"""Safe Markdown -> HTML for admin-authored and AI-generated text.

Raw HTML in the source is disabled, and the output is additionally sanitised with nh3,
so neither editors nor model output can inject scripts into the site or the PDF.
"""

from __future__ import annotations

import re

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
_IMAGE_ATTRS = {**_ALLOWED_ATTRS, "img": {"src", "alt", "title"}}
# Inline images may only come from our media library or another HTTPS host (never data:/http:).
_SAFE_IMAGE_SRC = re.compile(r"^(/api/v1/media/[a-f0-9]{32}\.(jpg|png|webp|gif)|https://[^\s\"'<>]+)$")


def _image_src_filter(tag: str, attr: str, value: str) -> str | None:
    if tag == "img" and attr == "src":
        return value if _SAFE_IMAGE_SRC.match(value) else None
    return value


def render_markdown(source: str, *, allow_images: bool = False) -> str:
    """Render untrusted Markdown to sanitised HTML.

    ``allow_images`` is only for editor-authored articles; AI output and readings never get images.
    """
    html = _md.render(source or "")
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS | {"img"} if allow_images else _ALLOWED_TAGS,
        attributes=_IMAGE_ATTRS if allow_images else _ALLOWED_ATTRS,
        attribute_filter=_image_src_filter if allow_images else None,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer nofollow",
    )
