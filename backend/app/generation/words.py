"""Unicode-aware word counting for AI replies (the client requires re-asking below N words).

Rules
- A word is a run of letters/digits in any script (Latin, Arabic, Cyrillic, Hangul, ...).
  Apostrophes and hyphens inside a word ("don't", "well-being") and separators inside numbers
  ("24.3", "1,000") do not split it.
- CJK ideographs and Japanese kana are written without spaces, so each character counts as one word.
- Markdown syntax (headings, emphasis, list markers, tables, link targets) is ignored.
"""

from __future__ import annotations

import re
import unicodedata

# Scripts written without spaces between words; every character counts as one word.
_CJK_RANGES: tuple[tuple[int, int], ...] = (
    (0x3400, 0x4DBF),  # CJK Unified Ideographs Extension A
    (0x4E00, 0x9FFF),  # CJK Unified Ideographs
    (0xF900, 0xFAFF),  # CJK Compatibility Ideographs
    (0x20000, 0x3134F),  # CJK Unified Ideographs Extensions B..H
    (0x3041, 0x3096),  # Hiragana letters
    (0x309D, 0x309F),  # Hiragana iteration marks
    (0x30A1, 0x30FA),  # Katakana letters (excludes the middle dot U+30FB)
    (0x30FC, 0x30FF),  # Katakana prolonged sound mark and iteration marks
    (0x31F0, 0x31FF),  # Katakana Phonetic Extensions
    (0xFF66, 0xFF9D),  # Half-width Katakana
)
_CJK = "".join(f"{chr(low)}-{chr(high)}" for low, high in _CJK_RANGES)
# A letter or digit that is not CJK (``[^\W_]`` = \w without the underscore used by Markdown).
_LETTER = rf"(?:(?![{_CJK}])[^\W_])"
_RUN = rf"{_LETTER}+"
_JOINER = r"(?:['’\-‐]|(?<=\d)[.,:](?=\d))"
_TOKEN = re.compile(rf"[{_CJK}]|{_RUN}(?:{_JOINER}{_RUN})*")

_LINK_TARGET = re.compile(r"\]\([^)\s]*(?:\s+\"[^\"]*\")?\)")  # [text](url "title") -> keep only text
_BARE_URL = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)
_LIST_MARKER = re.compile(r"^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+", re.MULTILINE)


def _strip_marks(text: str) -> str:
    """Drop combining marks and format characters so they never split a word.

    Arabic harakat (category Mn) and zero-width joiners (Cf, e.g. Persian ZWNJ) are not matched by
    ``\\w``; removing them keeps "مُحَمَّد" as one word instead of several.
    """
    return "".join(ch for ch in text if unicodedata.category(ch)[0] != "M" and unicodedata.category(ch) != "Cf")


def count_words(text: str | None) -> int:
    """Number of words in ``text`` (Markdown allowed). See the module docstring for the rules."""
    if not text:
        return 0
    cleaned = unicodedata.normalize("NFC", text)
    cleaned = _LINK_TARGET.sub("]", cleaned)
    cleaned = _BARE_URL.sub(" url ", cleaned)  # a URL counts as a single word
    cleaned = _LIST_MARKER.sub("", cleaned)
    cleaned = _strip_marks(cleaned)
    return sum(1 for _ in _TOKEN.finditer(cleaned))
