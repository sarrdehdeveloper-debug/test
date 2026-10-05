"""Heavenly stems, earthly branches and the sexagenary (60-pair) cycle.

Characters are the ones lunar-python returns; stems and branches are identical in simplified and
traditional Chinese, so no conversion is needed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.charts.schemas import ChineseAnimal, Element, Pillar, Polarity

SEXAGENARY_CYCLE: Final = 60


@dataclass(frozen=True)
class Stem:
    char: str
    pinyin: str
    element: Element
    polarity: Polarity


@dataclass(frozen=True)
class Branch:
    char: str
    pinyin: str
    animal: ChineseAnimal


STEMS: Final[tuple[Stem, ...]] = (
    Stem("甲", "jia", "wood", "yang"),
    Stem("乙", "yi", "wood", "yin"),
    Stem("丙", "bing", "fire", "yang"),
    Stem("丁", "ding", "fire", "yin"),
    Stem("戊", "wu", "earth", "yang"),
    Stem("己", "ji", "earth", "yin"),
    Stem("庚", "geng", "metal", "yang"),
    Stem("辛", "xin", "metal", "yin"),
    Stem("壬", "ren", "water", "yang"),
    Stem("癸", "gui", "water", "yin"),
)

BRANCHES: Final[tuple[Branch, ...]] = (
    Branch("子", "zi", "rat"),
    Branch("丑", "chou", "ox"),
    Branch("寅", "yin", "tiger"),
    Branch("卯", "mao", "rabbit"),
    Branch("辰", "chen", "dragon"),
    Branch("巳", "si", "snake"),
    Branch("午", "wu", "horse"),
    Branch("未", "wei", "goat"),
    Branch("申", "shen", "monkey"),
    Branch("酉", "you", "rooster"),
    Branch("戌", "xu", "dog"),
    Branch("亥", "hai", "pig"),
)

_STEM_INDEX: Final = {stem.char: i for i, stem in enumerate(STEMS)}
_BRANCH_INDEX: Final = {branch.char: i for i, branch in enumerate(BRANCHES)}


def stem_index(char: str) -> int:
    """0 for 甲 … 9 for 癸."""
    try:
        return _STEM_INDEX[char]
    except KeyError:
        raise ValueError(f"not a heavenly stem: {char!r}") from None


def branch_index(char: str) -> int:
    """0 for 子 … 11 for 亥."""
    try:
        return _BRANCH_INDEX[char]
    except KeyError:
        raise ValueError(f"not an earthly branch: {char!r}") from None


def make_pillar(stem: str, branch: str) -> Pillar:
    """Build a Pillar from its two characters, rejecting pairs that never occur in the 60-cycle."""
    s, b = stem_index(stem), branch_index(branch)
    # Stems and branches advance together, so a valid pair always has matching parity (甲子, never 甲丑).
    if (s - b) % 2:
        raise ValueError(f"not a sexagenary pair: {stem}{branch}")
    return _pillar(s, b)


def pillar_from_ganzhi(ganzhi: str) -> Pillar:
    """``"甲子"`` -> Pillar."""
    if len(ganzhi) != 2:
        raise ValueError(f"expected two characters (stem + branch), got {ganzhi!r}")
    return make_pillar(ganzhi[0], ganzhi[1])


def pillar_at(index: int) -> Pillar:
    """Pillar at position ``index`` of the sexagenary cycle (0 = 甲子, 59 = 癸亥; wraps around)."""
    return _pillar(index % 10, index % 12)


def sexagenary_index(pillar: Pillar) -> int:
    """Inverse of :func:`pillar_at`: the n in 0..59 with n % 10 == stem and n % 12 == branch."""
    s, b = stem_index(pillar.stem), branch_index(pillar.branch)
    return (6 * s - 5 * b) % SEXAGENARY_CYCLE


def shift_pillar(pillar: Pillar, offset: int) -> Pillar:
    """Move ``offset`` steps along the 60-cycle (e.g. -1 gives the previous year's pillar)."""
    return pillar_at(sexagenary_index(pillar) + offset)


def _pillar(s: int, b: int) -> Pillar:
    stem, branch = STEMS[s], BRANCHES[b]
    return Pillar(
        stem=stem.char,
        branch=branch.char,
        stem_pinyin=stem.pinyin,
        branch_pinyin=branch.pinyin,
        animal=branch.animal,
        element=stem.element,
        polarity=stem.polarity,
    )
