import {
  CHINESE_ANIMALS,
  WESTERN_SIGNS,
  type ChineseAnimal,
  type Polarity,
  type WesternSign,
} from "@/lib/types";

/**
 * Yin/yang of a Chinese year animal. In the sexagenary cycle a branch always pairs with a stem of
 * the same polarity, so the year's polarity follows from its animal: rat, tiger, dragon, horse,
 * monkey, dog are yang; ox, rabbit, snake, goat, rooster, pig are yin.
 */
export function animalPolarity(animal: ChineseAnimal): Polarity {
  return CHINESE_ANIMALS.indexOf(animal) % 2 === 0 ? "yang" : "yin";
}

export type SignElement = "fire" | "earth" | "air" | "water";
export type SignModality = "cardinal" | "fixed" | "mutable";

/** Triplicity (element) and quadruplicity (modality) of a Western sign: Aries = cardinal fire… */
export function signQualities(sign: WesternSign): { element: SignElement; modality: SignModality } {
  const index = WESTERN_SIGNS.indexOf(sign);
  const elements: SignElement[] = ["fire", "earth", "air", "water"];
  const modalities: SignModality[] = ["cardinal", "fixed", "mutable"];
  return { element: elements[index % 4], modality: modalities[index % 3] };
}
