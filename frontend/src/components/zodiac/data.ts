import type { ChineseAnimal, Element, WesternSign } from "@/lib/types";

/** Astrological glyphs; U+FE0E forces text (not emoji) presentation. */
export const SIGN_GLYPHS: Record<WesternSign, string> = {
  aries: "♈︎",
  taurus: "♉︎",
  gemini: "♊︎",
  cancer: "♋︎",
  leo: "♌︎",
  virgo: "♍︎",
  libra: "♎︎",
  scorpio: "♏︎",
  sagittarius: "♐︎",
  capricorn: "♑︎",
  aquarius: "♒︎",
  pisces: "♓︎",
};

/** Traditional characters of the twelve earthly-branch animals. */
export const ANIMAL_CHARS: Record<ChineseAnimal, string> = {
  rat: "鼠",
  ox: "牛",
  tiger: "虎",
  rabbit: "兔",
  dragon: "龍",
  snake: "蛇",
  horse: "馬",
  goat: "羊",
  monkey: "猴",
  rooster: "雞",
  dog: "狗",
  pig: "豬",
};

export const ELEMENT_CHARS: Record<Element, string> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

/** Planet / point glyphs for chart summaries. */
export const POINT_GLYPHS = {
  sun: "☉︎",
  moon: "☽︎",
  ascendant: "AC",
} as const;
