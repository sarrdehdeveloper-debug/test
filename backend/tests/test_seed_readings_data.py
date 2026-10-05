"""Content checks for the pre-written free-plan readings (app/seed/data/free_readings_<locale>.json).

The free plan serves these texts without any AI call, so they are validated like code: exact key
set, length and Markdown shape, script, banned claims, and astrological accuracy (Western element,
modality and rulers; Chinese fixed element and yin/yang).
"""

from __future__ import annotations

import json
import re
from functools import cache
from pathlib import Path
from typing import Any

import pytest

import app.seed
from app.charts.schemas import CHINESE_ANIMALS, WESTERN_SIGNS
from app.markdown import render_markdown

DATA_DIR = Path(app.seed.__file__).parent / "data"
LOCALES = ("en", "ar")
KINDS = ("sign", "animal")

MIN_WORDS, MAX_WORDS = 150, 300
TITLE_MAX_CHARS = 300  # free_readings.title is String(300)
TITLE_SEPARATOR = " — "

AR_NAMES = {
    "sign": {
        "aries": "الحمل",
        "taurus": "الثور",
        "gemini": "الجوزاء",
        "cancer": "السرطان",
        "leo": "الأسد",
        "virgo": "العذراء",
        "libra": "الميزان",
        "scorpio": "العقرب",
        "sagittarius": "القوس",
        "capricorn": "الجدي",
        "aquarius": "الدلو",
        "pisces": "الحوت",
    },
    "animal": {
        "rat": "الفأر",
        "ox": "الثور",
        "tiger": "النمر",
        "rabbit": "الأرنب",
        "dragon": "التنين",
        "snake": "الأفعى",
        "horse": "الحصان",
        "goat": "الماعز",
        "monkey": "القرد",
        "rooster": "الديك",
        "dog": "الكلب",
        "pig": "الخنزير",
    },
}

# (element, modality, rulers: traditional first, then modern co-ruler if any)
WESTERN_FACTS: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "aries": ("fire", "cardinal", ("Mars",)),
    "taurus": ("earth", "fixed", ("Venus",)),
    "gemini": ("air", "mutable", ("Mercury",)),
    "cancer": ("water", "cardinal", ("Moon",)),
    "leo": ("fire", "fixed", ("Sun",)),
    "virgo": ("earth", "mutable", ("Mercury",)),
    "libra": ("air", "cardinal", ("Venus",)),
    "scorpio": ("water", "fixed", ("Mars", "Pluto")),
    "sagittarius": ("fire", "mutable", ("Jupiter",)),
    "capricorn": ("earth", "cardinal", ("Saturn",)),
    "aquarius": ("air", "fixed", ("Saturn", "Uranus")),
    "pisces": ("water", "mutable", ("Jupiter", "Neptune")),
}
AR_ELEMENT = {"fire": "ناري", "earth": "ترابي", "air": "هوائي", "water": "مائي"}
AR_MODALITY = {"cardinal": "قيادي", "fixed": "ثابت", "mutable": "مرن"}
AR_BODY = {
    "Sun": "الشمس",
    "Moon": "القمر",
    "Mercury": "عطارد",
    "Venus": "الزهرة",
    "Mars": "المريخ",
    "Jupiter": "المشتري",
    "Saturn": "زحل",
    "Uranus": "أورانوس",
    "Neptune": "نبتون",
    "Pluto": "بلوتو",
}
PLANETS = ("Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto")

CHINESE_FACTS: dict[str, tuple[str, str]] = {
    "rat": ("water", "yang"),
    "ox": ("earth", "yin"),
    "tiger": ("wood", "yang"),
    "rabbit": ("wood", "yin"),
    "dragon": ("earth", "yang"),
    "snake": ("fire", "yin"),
    "horse": ("fire", "yang"),
    "goat": ("earth", "yin"),
    "monkey": ("metal", "yang"),
    "rooster": ("metal", "yin"),
    "dog": ("earth", "yang"),
    "pig": ("water", "yin"),
}
AR_CN_ELEMENT = {"water": "الماء", "earth": "التراب", "wood": "الخشب", "fire": "النار", "metal": "المعدن"}
AR_POLARITY = {"yin": "ين", "yang": "يانغ"}

PLACEHOLDERS = ("todo", "lorem", "ipsum", "tbd", "fixme", "xxx", "placeholder", "{{", "}}")
# Tendencies only: no fate, luck, health, money or legal claims.
FORBIDDEN_EN = (
    r"\byou will\b",
    r"\bluck",
    r"\bguarantee",
    r"\bdestin(?:y|ies|ed)\b",
    r"\bfated?\b",
    r"\bdiagnos",
    r"\bcure",
    r"\bdisease",
    r"\billness",
    r"\bmedic",
    r"\btherap",
    r"\binvest(?:ment|ments|ing|or|ors)?\b",  # not "invested in someone" / "investigative"
    r"\bwealth",
    r"\bprofit",
    r"\blottery",
    r"\blegal\b",
    r"\blawsuit",
)
FORBIDDEN_AR_WORDS = (
    "سوف",
    "حظ",
    "محظوظ",
    "حتما",
    "مضمون",
    "مرض",
    "علاج",
    "دواء",
    "ثروة",
    "استثمار",
    "أرباح",
    "يانصيب",
    "قانوني",
)
AR_CLITICS = ("", "و", "ف", "ب", "ل", "ال", "وال", "فال", "بال", "لل")
# Gendered second-person forms; the Arabic copy addresses the reader only through neutral suffixes.
AR_GENDERED_ADDRESS = ("أنت", "اكتشف", "اكتشفي")

ARABIC_LETTERS = re.compile(r"[ء-ي]+")
ARABIC_DIACRITICS = re.compile(r"[ـً-ْٰ]")
ARABIC_SCRIPT = re.compile(r"[؀-ۿ]")
LATIN = re.compile(r"[A-Za-z]")
BULLET_LINE = re.compile(r"^- \*\*[^*\n]+:\*\* \S")
SENTENCE_END = re.compile(r"[.!?؟]")


class _DuplicateKeyError(ValueError):
    pass


def _reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    keys = [k for k, _ in pairs]
    duplicates = {k for k in keys if keys.count(k) > 1}
    if duplicates:
        raise _DuplicateKeyError(f"duplicate keys: {sorted(duplicates)}")
    return dict(pairs)


@cache
def _load(locale: str) -> dict[str, Any]:
    path = DATA_DIR / f"free_readings_{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_reject_duplicates)


def _entries(locale: str):
    data = _load(locale)
    for kind in KINDS:
        for key, entry in data[kind].items():
            yield kind, key, entry


def _word_count(text: str) -> int:
    """Whitespace-separated tokens that contain a letter or digit (bare '-' / '—' are not words)."""
    return sum(1 for token in text.split() if re.search(r"\w", token))


def _paragraphs(body: str) -> list[str]:
    return [block for block in body.split("\n\n") if not block.startswith("- ")]


def _strip_ar(text: str) -> str:
    return ARABIC_DIACRITICS.sub("", text)


def _ar_tokens(text: str) -> set[str]:
    return set(ARABIC_LETTERS.findall(_strip_ar(text)))


def _ar_has_word(text: str, word: str) -> bool:
    tokens = _ar_tokens(text)
    return any(prefix + word in tokens for prefix in AR_CLITICS)


def _ar_has_polarity(text: str, polarity: str) -> bool:
    # Exact tokens only: with clitics, "ين" (yin) would also match words such as "بين" (between).
    word = AR_POLARITY[polarity]
    return bool(_ar_tokens(text) & {word, "ال" + word})


def _localized_name(locale: str, kind: str, key: str) -> str:
    return AR_NAMES[kind][key] if locale == "ar" else key.capitalize()


def _assert_no_violations(violations: list[str]) -> None:
    assert not violations, "\n".join(violations)


# --------------------------------------------------------------------------- structure


@pytest.mark.parametrize("locale", LOCALES)
def test_file_is_utf8_json_without_duplicate_keys(locale):
    path = DATA_DIR / f"free_readings_{locale}.json"
    assert path.is_file(), f"missing {path}"
    data = _load(locale)
    assert isinstance(data, dict)


def test_duplicate_key_guard_detects_duplicates():
    with pytest.raises(_DuplicateKeyError):
        json.loads('{"sign": {}, "sign": {}}', object_pairs_hook=_reject_duplicates)


@pytest.mark.parametrize("locale", LOCALES)
def test_exactly_twelve_signs_and_twelve_animals_in_canonical_order(locale):
    data = _load(locale)
    assert list(data) == list(KINDS)
    assert list(data["sign"]) == list(WESTERN_SIGNS)
    assert list(data["animal"]) == list(CHINESE_ANIMALS)
    assert len(data["sign"]) == 12 and len(data["animal"]) == 12


@pytest.mark.parametrize("locale", LOCALES)
def test_every_entry_has_only_non_empty_title_and_body_strings(locale):
    violations = []
    for kind, key, entry in _entries(locale):
        if set(entry) != {"title", "body"}:
            violations.append(f"{kind}/{key}: keys {sorted(entry)}")
            continue
        for field in ("title", "body"):
            value = entry[field]
            if not isinstance(value, str) or not value.strip():
                violations.append(f"{kind}/{key}: empty {field}")
            elif value != value.strip():
                violations.append(f"{kind}/{key}: {field} has leading/trailing whitespace")
    _assert_no_violations(violations)


@pytest.mark.parametrize("locale", LOCALES)
def test_titles_name_the_sign_or_animal_and_fit_the_column(locale):
    violations = []
    for kind, key, entry in _entries(locale):
        title = entry["title"]
        prefix = _localized_name(locale, kind, key) + TITLE_SEPARATOR
        if not title.startswith(prefix) or len(title) <= len(prefix):
            violations.append(f"{kind}/{key}: title {title!r} must look like {prefix!r}<evocative phrase>")
        if len(title) > min(TITLE_MAX_CHARS, 80):
            violations.append(f"{kind}/{key}: title too long ({len(title)} chars)")
    _assert_no_violations(violations)


@pytest.mark.parametrize("locale", LOCALES)
def test_titles_and_bodies_are_unique(locale):
    entries = list(_entries(locale))
    titles = [entry["title"] for _, _, entry in entries]
    bodies = [entry["body"] for _, _, entry in entries]
    assert len(set(titles)) == len(titles)
    assert len(set(bodies)) == len(bodies)


# --------------------------------------------------------------------------- length & markdown


@pytest.mark.parametrize("locale", LOCALES)
def test_body_word_counts_are_within_range(locale):
    violations = [
        f"{kind}/{key}: {count} words"
        for kind, key, entry in _entries(locale)
        if not MIN_WORDS <= (count := _word_count(entry["body"])) <= MAX_WORDS
    ]
    _assert_no_violations(violations)


def test_word_count_ignores_bare_markdown_markers():
    assert _word_count("- **Bold:** one two — three") == 4
    assert _word_count("كلمة - كلمتان — ثلاث") == 3


@pytest.mark.parametrize("locale", LOCALES)
def test_bodies_have_paragraphs_and_exactly_one_short_bullet_list(locale):
    violations = []
    for kind, key, entry in _entries(locale):
        body = entry["body"]
        html = render_markdown(body)
        bullets = [line for line in body.splitlines() if line.startswith("- ")]
        if html.count("<ul>") != 1:
            violations.append(f"{kind}/{key}: expected exactly one bullet list, got {html.count('<ul>')}")
        if not 3 <= html.count("<li>") <= 4 or len(bullets) != html.count("<li>"):
            violations.append(f"{kind}/{key}: expected 3-4 list items, got {html.count('<li>')}")
        if not 3 <= html.count("<p>") <= 4:
            violations.append(f"{kind}/{key}: expected 3-4 paragraphs, got {html.count('<p>')}")
        if any(not BULLET_LINE.match(line) for line in bullets):
            violations.append(f"{kind}/{key}: every bullet must start with a bold label ('- **Label:** ...')")
    _assert_no_violations(violations)


@pytest.mark.parametrize("locale", LOCALES)
def test_markdown_source_is_plain_and_tidy(locale):
    violations = []
    for kind, key, entry in _entries(locale):
        body = entry["body"]
        if "<" in body or ">" in body:
            violations.append(f"{kind}/{key}: raw HTML or angle brackets")
        if "](" in body or "`" in body or re.search(r"^#", body, re.MULTILINE):
            violations.append(f"{kind}/{key}: links, code or headings are not part of the reading format")
        if "\n\n\n" in body or any(line != line.rstrip() for line in body.splitlines()):
            violations.append(f"{kind}/{key}: stray blank lines or trailing whitespace")
        if "  " in body:
            violations.append(f"{kind}/{key}: double spaces")
    _assert_no_violations(violations)


@pytest.mark.parametrize("locale", LOCALES)
def test_rendered_html_matches_what_the_api_serves(locale):
    for kind, key, entry in _entries(locale):
        html = render_markdown(entry["body"])
        assert html.startswith("<p>"), f"{kind}/{key}"
        assert "<strong>" in html, f"{kind}/{key}"
        assert "<script" not in html.lower()


# --------------------------------------------------------------------------- language & content rules


def test_arabic_titles_and_bodies_are_arabic_script_only():
    violations = []
    for kind, key, entry in _entries("ar"):
        for field in ("title", "body"):
            text = entry[field]
            if not ARABIC_SCRIPT.search(text):
                violations.append(f"{kind}/{key}: {field} has no Arabic script")
            if LATIN.search(text):
                violations.append(f"{kind}/{key}: {field} contains Latin letters")
    _assert_no_violations(violations)


def test_english_titles_and_bodies_contain_no_arabic_script():
    violations = [
        f"{kind}/{key}: {field}"
        for kind, key, entry in _entries("en")
        for field in ("title", "body")
        if ARABIC_SCRIPT.search(entry[field])
    ]
    _assert_no_violations(violations)


@pytest.mark.parametrize("locale", LOCALES)
def test_no_placeholders_or_digits(locale):
    violations = []
    for kind, key, entry in _entries(locale):
        text = f"{entry['title']}\n{entry['body']}"
        lowered = text.lower()
        violations += [f"{kind}/{key}: placeholder {p!r}" for p in PLACEHOLDERS if p in lowered]
        # No dates, lucky numbers or other figures (\d also matches Arabic-Indic digits).
        if re.search(r"\d", text):
            violations.append(f"{kind}/{key}: contains digits")
    _assert_no_violations(violations)


def test_forbidden_patterns_do_not_flag_ordinary_words():
    benign = "deeply invested in loved ones, an investigative mind, a direction not a destination"
    assert not [p for p in FORBIDDEN_EN if re.search(p, benign, re.IGNORECASE)]
    assert re.search(r"\binvest(?:ment|ments|ing|or|ors)?\b", "a smart investment")
    assert re.search(r"\bdestin(?:y|ies|ed)\b", "it is your destiny")


def test_english_readings_avoid_deterministic_luck_health_money_and_legal_claims():
    violations = [
        f"{kind}/{key}: matches {pattern!r}"
        for kind, key, entry in _entries("en")
        for pattern in FORBIDDEN_EN
        if re.search(pattern, entry["body"], re.IGNORECASE)
    ]
    _assert_no_violations(violations)


def test_arabic_readings_avoid_deterministic_luck_health_money_and_legal_claims():
    violations = [
        f"{kind}/{key}: contains {word!r}"
        for kind, key, entry in _entries("ar")
        for word in FORBIDDEN_AR_WORDS
        if _ar_has_word(entry["body"], word)
    ]
    _assert_no_violations(violations)


def test_arabic_word_matcher_respects_word_boundaries():
    assert _ar_has_word("هذه لحظة جميلة", "حظ") is False
    assert _ar_has_word("جاء بالحظ", "حظ") is True
    assert _ar_has_word("قمرٌ مضيء", "قمر") is True
    assert _ar_has_polarity("يوازنون بين أمرين", "yin") is False
    assert _ar_has_polarity("حيوان ين عنصره", "yin") is True
    assert _ar_has_polarity("بقطبية الين", "yin") is True


def test_arabic_readings_use_gender_neutral_address():
    violations = [
        f"{kind}/{key}: {form!r}"
        for kind, key, entry in _entries("ar")
        for form in AR_GENDERED_ADDRESS
        if form in _ar_tokens(entry["body"])
    ]
    _assert_no_violations(violations)


@pytest.mark.parametrize("locale", LOCALES)
def test_each_reading_ends_with_one_sentence_inviting_to_the_full_report(locale):
    required = {
        "en": ("full report", "Moon", "Ascendant", "month", "day", "hour"),
        "ar": ("التقرير الكامل", "قمرك", "طالعك", "شهر", "يومه", "ساعته"),
    }[locale]
    violations = []
    for kind, key, entry in _entries(locale):
        closing = _paragraphs(entry["body"])[-1]
        missing = [word for word in required if word not in closing]
        if missing:
            violations.append(f"{kind}/{key}: closing sentence misses {missing}")
        if len(SENTENCE_END.findall(closing)) != 1 or not SENTENCE_END.match(closing[-1]):
            violations.append(f"{kind}/{key}: closing must be exactly one sentence")
    _assert_no_violations(violations)


@pytest.mark.parametrize("locale", LOCALES)
def test_sign_and_animal_closings_read_differently(locale):
    # Both readings appear together on the free result page, so their endings must not echo each other.
    def opening(entry: dict[str, str]) -> str:
        return " ".join(_paragraphs(entry["body"])[-1].split()[:3])

    data = _load(locale)
    sign_openings = {opening(entry) for entry in data["sign"].values()}
    animal_openings = {opening(entry) for entry in data["animal"].values()}
    assert not sign_openings & animal_openings


def test_english_and_arabic_share_the_same_shape():
    for kind in KINDS:
        for key in _load("en")[kind]:
            en_body, ar_body = _load("en")[kind][key]["body"], _load("ar")[kind][key]["body"]
            en_bullets = sum(line.startswith("- ") for line in en_body.splitlines())
            ar_bullets = sum(line.startswith("- ") for line in ar_body.splitlines())
            assert en_bullets == ar_bullets, f"{kind}/{key}"
            assert len(_paragraphs(en_body)) == len(_paragraphs(ar_body)), f"{kind}/{key}"


# --------------------------------------------------------------------------- astrological accuracy


@pytest.mark.parametrize("sign", WESTERN_SIGNS)
def test_english_sign_states_element_modality_and_correct_rulers(sign):
    element, modality, rulers = WESTERN_FACTS[sign]
    body = _load("en")["sign"][sign]["body"]
    assert f"{modality} {element} sign" in body
    assert re.search(rf"ruled by (?:the )?{rulers[0]}\b", body)
    for ruler in rulers[1:]:
        assert re.search(rf"\b{ruler}\b", body)
    wrong = [p for p in PLANETS if p not in rulers and re.search(rf"\b{p}\b", body)]
    assert not wrong, f"{sign} mentions unrelated planets {wrong}"


@pytest.mark.parametrize("sign", WESTERN_SIGNS)
def test_arabic_sign_states_element_modality_and_correct_rulers(sign):
    element, modality, rulers = WESTERN_FACTS[sign]
    body = _strip_ar(_load("ar")["sign"][sign]["body"])
    assert f"برج {AR_ELEMENT[element]} {AR_MODALITY[modality]}" in body
    assert re.search(rf"[يت]حكمه {AR_BODY[rulers[0]]}", body)
    for ruler in rulers[1:]:
        assert _ar_has_word(body, AR_BODY[ruler])
    wrong = [p for p in PLANETS if p not in rulers and _ar_has_word(body, AR_BODY[p])]
    assert not wrong, f"{sign} mentions unrelated planets {wrong}"


@pytest.mark.parametrize("animal", CHINESE_ANIMALS)
def test_english_animal_states_fixed_element_and_polarity(animal):
    element, polarity = CHINESE_FACTS[animal]
    opposite = "yin" if polarity == "yang" else "yang"
    body = _load("en")["animal"][animal]["body"]
    assert re.search(rf"fixed element (?:is |of )?{element}\b", body)
    assert re.search(rf"\b{polarity}\b", body)
    assert not re.search(rf"\b{opposite}\b", body)


@pytest.mark.parametrize("animal", CHINESE_ANIMALS)
def test_arabic_animal_states_fixed_element_and_polarity(animal):
    element, polarity = CHINESE_FACTS[animal]
    opposite = "yin" if polarity == "yang" else "yang"
    body = _strip_ar(_load("ar")["animal"][animal]["body"])
    assert re.search(rf"عنصر(?:ه الثابت هو)? {AR_CN_ELEMENT[element]}", body)
    assert _ar_has_polarity(body, polarity)
    assert not _ar_has_polarity(body, opposite)


@pytest.mark.parametrize("locale", LOCALES)
def test_each_body_names_its_own_sign_or_animal(locale):
    violations = []
    for kind, key, entry in _entries(locale):
        name = _localized_name(locale, kind, key)
        found = _ar_has_word(entry["body"], name.removeprefix("ال")) if locale == "ar" else name in entry["body"]
        if not found:
            violations.append(f"{kind}/{key}: body never names {name}")
    _assert_no_violations(violations)
