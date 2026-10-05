import type { ChineseAnimal, Element } from "@/lib/types";
import { ANIMAL_CHARS, ELEMENT_CHARS } from "./data";
import { GlyphBadge, type GlyphBadgeProps } from "./SignIcon";

/** Chinese zodiac animal as its traditional character (鼠 … 豬) in a gold ring. */
export function AnimalIcon({ animal, ...props }: GlyphBadgeProps & { animal: ChineseAnimal }) {
  return (
    <GlyphBadge
      glyph={ANIMAL_CHARS[animal]}
      fontClass="font-[family-name:var(--font-cjk)] font-semibold"
      {...props}
    />
  );
}

/** Five-element character (木火土金水) in a gold ring. */
export function ElementIcon({ element, ...props }: GlyphBadgeProps & { element: Element }) {
  return (
    <GlyphBadge
      glyph={ELEMENT_CHARS[element]}
      fontClass="font-[family-name:var(--font-cjk)] font-semibold"
      {...props}
    />
  );
}
