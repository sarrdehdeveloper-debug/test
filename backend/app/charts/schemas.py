"""Typed chart structures shared by calculation, orders, generation and PDF modules.

``Chart.model_dump(mode="json")`` is what gets stored in ``orders.chart``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

CALC_VERSION = "zb-calc-1"

WesternSign = Literal[
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
]
WESTERN_SIGNS: tuple[WesternSign, ...] = (
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
)

ChineseAnimal = Literal[
    "rat",
    "ox",
    "tiger",
    "rabbit",
    "dragon",
    "snake",
    "horse",
    "goat",
    "monkey",
    "rooster",
    "dog",
    "pig",
]
CHINESE_ANIMALS: tuple[ChineseAnimal, ...] = (
    "rat",
    "ox",
    "tiger",
    "rabbit",
    "dragon",
    "snake",
    "horse",
    "goat",
    "monkey",
    "rooster",
    "dog",
    "pig",
)

Element = Literal["wood", "fire", "earth", "metal", "water"]
Polarity = Literal["yang", "yin"]
YearBoundary = Literal["lichun", "lunar_new_year"]
DayBoundary = Literal["midnight", "zi_23"]


class ZodiacPoint(BaseModel):
    sign: WesternSign
    longitude: float = Field(ge=0, lt=360, description="Tropical ecliptic longitude of date, degrees")
    degree_in_sign: float = Field(ge=0, lt=30)


class WesternChart(BaseModel):
    zodiac: Literal["tropical"] = "tropical"
    sun: ZodiacPoint
    moon: ZodiacPoint
    ascendant: ZodiacPoint
    sun_on_cusp: bool = Field(description="Sun within 1 degree of a sign boundary")


class Pillar(BaseModel):
    stem: str = Field(description="Heavenly stem, Chinese character, e.g. 甲")
    branch: str = Field(description="Earthly branch, Chinese character, e.g. 子")
    stem_pinyin: str
    branch_pinyin: str
    animal: ChineseAnimal
    element: Element = Field(description="Element of the heavenly stem")
    polarity: Polarity


class ChineseChart(BaseModel):
    year_boundary: YearBoundary
    day_boundary: DayBoundary
    year: Pillar
    month: Pillar
    day: Pillar
    hour: Pillar


class ChartInput(BaseModel):
    local_datetime: str = Field(description="ISO local wall time with offset, e.g. 1990-05-17T14:30:00+03:00")
    utc_datetime: str
    timezone: str
    utc_offset_minutes: int
    is_dst: bool
    fold: int = 0
    latitude: float
    longitude: float
    place_label: str


class Chart(BaseModel):
    calc_version: str = CALC_VERSION
    input: ChartInput
    western: WesternChart
    chinese: ChineseChart
    # Machine-readable notes, e.g. "sun_on_cusp", "near_solar_term_boundary".
    warnings: list[str] = Field(default_factory=list)


class FreeSigns(BaseModel):
    """Result of the free plan, computed from the birth date only."""

    sun_sign: WesternSign
    # Set when the Sun changes sign on that calendar date (exact sign needs the birth time).
    sun_sign_alternative: WesternSign | None = None
    year_animal: ChineseAnimal
    year_element: Element
    # Set when the Chinese year boundary falls on that date.
    year_animal_alternative: ChineseAnimal | None = None
    year_boundary: YearBoundary
