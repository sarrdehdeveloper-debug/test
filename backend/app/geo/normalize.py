"""Text folding shared by the geo importer (when building search columns) and the search API.

Both sides must fold identically, otherwise a stored name and a typed query never meet.
"""

from __future__ import annotations

import unicodedata

# Joins the spellings stored in ``cities.search_text``; the search API relies on it as a token boundary.
SEARCH_SEPARATOR = "|"

# Letters NFKD cannot decompose into "base + accent", plus spelling variants people use
# interchangeably when typing (Arabic hamza seats, ta marbuta, Persian yeh/kaf, curly quotes).
_SPECIAL_LETTERS = str.maketrans(
    {
        "ł": "l",
        "Ł": "l",
        "đ": "d",
        "Đ": "d",
        "ð": "d",
        "Ð": "d",
        "ø": "o",
        "Ø": "o",
        "ħ": "h",
        "Ħ": "h",
        "ı": "i",
        "ŀ": "l",
        "ŧ": "t",
        "æ": "ae",
        "Æ": "ae",
        "œ": "oe",
        "Œ": "oe",
        "ß": "ss",
        "þ": "th",
        "Þ": "th",
        "’": "'",
        "‘": "'",
        "ʻ": "'",
        "ʼ": "'",
        "`": "'",
        "ٱ": "ا",
        "ة": "ه",
        "ى": "ي",
        "ی": "ي",
        "ک": "ك",
        "ـ": "",  # tatweel (Arabic elongation), purely decorative
    }
)


def fold(text: str) -> str:
    """Lower-case, strip accents/diacritics (incl. Arabic tashkeel) and unify letter variants.

    ``"Zürich"`` -> ``"zurich"``, ``"Łódź"`` -> ``"lodz"``, ``"الإسكندرية"`` -> ``"الاسكندريه"``.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    # NFC re-composes scripts whose syllables NFKD split apart (e.g. Hangul) but which carry no marks.
    return unicodedata.normalize("NFC", without_marks.translate(_SPECIAL_LETTERS)).lower().strip()


def clean_query(text: str) -> str:
    """Drop control/format characters (PostgreSQL rejects NUL; RTL marks sneak in when typing Arabic)
    and collapse whitespace."""
    kept = []
    for ch in text:
        category = unicodedata.category(ch)
        if category == "Cc":
            kept.append(" ")
        elif category[0] != "C":
            kept.append(ch)
    return " ".join("".join(kept).split())
