"""Brand assets for the PDF (logo + OFL fonts), embedded as data URIs.

Chromium renders the report offline, so every asset must be inline. Files are read once per
process and cached.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
LOGO_PATH = ASSETS_DIR / "logo.svg"

# Brand palette (from the logo).
GOLD = "#A46F26"
GOLD_MID = "#C78933"
GOLD_LIGHT = "#E9C77B"
NAVY = "#0E1726"
IVORY = "#FBF7EF"

# unicode-range values from @fontsource, so the browser picks the right file per character.
_LATIN = (
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, "
    "U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
)
_LATIN_EXT = (
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, "
    "U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF"
)
_ARABIC = (
    "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, "
    "U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC"
)


@dataclass(frozen=True)
class FontFace:
    family: str
    file_name: str
    weight: str
    unicode_range: str
    style: str = "normal"


LATIN_FONTS: tuple[FontFace, ...] = (
    FontFace("Cormorant Garamond", "cormorant-garamond-latin-500-normal.woff2", "500", _LATIN),
    FontFace("Cormorant Garamond", "cormorant-garamond-latin-ext-500-normal.woff2", "500", _LATIN_EXT),
    FontFace("Cormorant Garamond", "cormorant-garamond-latin-500-italic.woff2", "500", _LATIN, "italic"),
    FontFace("Cormorant Garamond", "cormorant-garamond-latin-600-normal.woff2", "600", _LATIN),
    FontFace("Cormorant Garamond", "cormorant-garamond-latin-ext-600-normal.woff2", "600", _LATIN_EXT),
    FontFace("Cormorant Garamond", "cormorant-garamond-latin-700-normal.woff2", "700", _LATIN),
    FontFace("Cinzel", "cinzel-latin-400-normal.woff2", "400", _LATIN),
    FontFace("Cinzel", "cinzel-latin-600-normal.woff2", "600", _LATIN),
    FontFace("Inter", "inter-latin-wght-normal.woff2", "100 900", _LATIN),
    FontFace("Inter", "inter-latin-ext-wght-normal.woff2", "100 900", _LATIN_EXT),
)

ARABIC_FONTS: tuple[FontFace, ...] = (
    FontFace("Amiri", "amiri-arabic-400-normal.woff2", "400", _ARABIC),
    FontFace("Amiri", "amiri-arabic-700-normal.woff2", "700", _ARABIC),
    # Amiri's Latin subset gives digits and punctuation inside Arabic text a matching design.
    FontFace("Amiri", "amiri-latin-400-normal.woff2", "400", _LATIN),
    FontFace("Amiri", "amiri-latin-700-normal.woff2", "700", _LATIN),
    FontFace("Noto Naskh Arabic", "noto-naskh-arabic-arabic-wght-normal.woff2", "400 700", _ARABIC),
)


def _data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


@lru_cache(maxsize=1)
def logo_data_uri() -> str:
    return _data_uri(LOGO_PATH, "image/svg+xml")


@lru_cache(maxsize=32)
def _font_data_uri(file_name: str) -> str:
    return _data_uri(FONTS_DIR / file_name, "font/woff2")


def _font_face_rule(face: FontFace) -> str:
    return (
        "@font-face {"
        f' font-family: "{face.family}"; font-style: {face.style}; font-weight: {face.weight};'
        " font-display: block;"
        f' src: url("{_font_data_uri(face.file_name)}") format("woff2");'
        f" unicode-range: {face.unicode_range};"
        " }"
    )


@lru_cache(maxsize=2)
def font_face_css(include_arabic: bool) -> str:
    """``@font-face`` rules for the report; Arabic faces only when the report needs them."""
    faces = LATIN_FONTS + (ARABIC_FONTS if include_arabic else ())
    return "\n".join(_font_face_rule(face) for face in faces)
