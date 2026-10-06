/**
 * Pure logic of the free-readings editor (/admin/free-readings): 12 Western signs + 12 Chinese
 * animals × content locales, each `{title, body}` (GET/PUT /admin/free-readings).
 */
import { humanize } from "@/lib/admin/format";
import type { FreeReading, FreeReadingKind, Locale } from "@/lib/admin/types";
import { CHINESE_ANIMALS, WESTERN_SIGNS, type ChineseAnimal, type WesternSign } from "@/lib/types";

export const READING_KINDS: FreeReadingKind[] = ["sign", "animal"];

export const KIND_LABELS: Record<FreeReadingKind, { title: string; singular: string }> = {
  sign: { title: "Western signs", singular: "Western sign" },
  animal: { title: "Chinese animals", singular: "Chinese animal" },
};

/** Tropical sun-sign date ranges (for orientation in the list; the API computes signs exactly). */
export const SIGN_DATES: Record<WesternSign, string> = {
  aries: "21 Mar – 19 Apr",
  taurus: "20 Apr – 20 May",
  gemini: "21 May – 20 Jun",
  cancer: "21 Jun – 22 Jul",
  leo: "23 Jul – 22 Aug",
  virgo: "23 Aug – 22 Sep",
  libra: "23 Sep – 22 Oct",
  scorpio: "23 Oct – 21 Nov",
  sagittarius: "22 Nov – 21 Dec",
  capricorn: "22 Dec – 19 Jan",
  aquarius: "20 Jan – 18 Feb",
  pisces: "19 Feb – 20 Mar",
};

/** Earthly branch order and a recent year of each animal (orientation only). */
export const ANIMAL_YEARS: Record<ChineseAnimal, string> = {
  rat: "2020, 2032",
  ox: "2021, 2033",
  tiger: "2022, 2034",
  rabbit: "2023, 2035",
  dragon: "2024, 2036",
  snake: "2025, 2037",
  horse: "2026, 2038",
  goat: "2027, 2039",
  monkey: "2028, 2040",
  rooster: "2029, 2041",
  dog: "2030, 2042",
  pig: "2031, 2043",
};

export function readingKeys(kind: FreeReadingKind): readonly string[] {
  return kind === "sign" ? WESTERN_SIGNS : CHINESE_ANIMALS;
}

/** "sign:aries" — id of one reading across locales (also the `?item=` URL value). */
export function readingId(kind: FreeReadingKind, key: string): string {
  return `${kind}:${key}`;
}

/** Parse `?item=sign:aries`; unknown kinds/keys → null. */
export function parseReadingId(
  value: string | null | undefined,
): { kind: FreeReadingKind; key: string } | null {
  if (!value) return null;
  const [kind, key] = value.split(":");
  if (kind !== "sign" && kind !== "animal") return null;
  return readingKeys(kind).includes(key) ? { kind, key } : null;
}

/** "aries" → "Aries", "rooster" → "Rooster". */
export function readingName(key: string): string {
  return humanize(key);
}

export function readingHint(kind: FreeReadingKind, key: string): string {
  return kind === "sign"
    ? (SIGN_DATES[key as WesternSign] ?? "")
    : `Years ${ANIMAL_YEARS[key as ChineseAnimal] ?? ""}`;
}

/** `{ "sign:aries": { en: FreeReading, ar: FreeReading } }`. */
export type ReadingIndex = Record<string, Record<Locale, FreeReading>>;

export function indexReadings(items: FreeReading[]): ReadingIndex {
  const out: ReadingIndex = {};
  for (const item of items) {
    const id = readingId(item.kind, item.key);
    (out[id] ??= {})[item.locale] = item;
  }
  return out;
}

export type ReadingState = "filled" | "partial" | "missing";

/** `filled` = title and body, `partial` = one of them, `missing` = neither (or not stored). */
export function readingState(
  reading: Pick<FreeReading, "title" | "body"> | undefined,
): ReadingState {
  if (!reading) return "missing";
  const title = reading.title.trim() !== "";
  const body = reading.body.trim() !== "";
  if (title && body) return "filled";
  return title || body ? "partial" : "missing";
}

/** Filled / total readings for a kind (or all kinds) and a locale (or all locales). */
export function coverage(
  index: ReadingIndex,
  locales: Locale[],
  kind?: FreeReadingKind,
): { filled: number; total: number } {
  const kinds = kind ? [kind] : READING_KINDS;
  let filled = 0;
  let total = 0;
  for (const k of kinds) {
    for (const key of readingKeys(k)) {
      for (const locale of locales) {
        total += 1;
        if (readingState(index[readingId(k, key)]?.[locale]) === "filled") filled += 1;
      }
    }
  }
  return { filled, total };
}

/** Editable text of one reading (`{title, body}` per locale). */
export interface ReadingDraft {
  title: string;
  body: string;
}

export function draftsFor(
  index: ReadingIndex,
  kind: FreeReadingKind,
  key: string,
  locales: Locale[],
): Record<Locale, ReadingDraft> {
  const entry = index[readingId(kind, key)] ?? {};
  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      { title: entry[locale]?.title ?? "", body: entry[locale]?.body ?? "" },
    ]),
  );
}

/** Locales whose draft differs from the stored reading. */
export function changedReadingLocales(
  original: Record<Locale, ReadingDraft>,
  draft: Record<Locale, ReadingDraft>,
): Locale[] {
  return Object.keys(draft).filter(
    (locale) =>
      (original[locale]?.title ?? "") !== draft[locale].title ||
      (original[locale]?.body ?? "") !== draft[locale].body,
  );
}

/** Replace one saved reading in the list returned by GET /free-readings. */
export function replaceReading(items: FreeReading[], saved: FreeReading): FreeReading[] {
  let found = false;
  const next = items.map((item) => {
    if (item.kind === saved.kind && item.key === saved.key && item.locale === saved.locale) {
      found = true;
      return saved;
    }
    return item;
  });
  return found ? next : [...next, saved];
}
