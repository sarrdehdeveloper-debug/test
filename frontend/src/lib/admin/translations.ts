import type { Locale, Translations } from "./types";

/** Helpers for `{en: {...}, ar: {...}}` translation maps edited with <TranslationTabs>. */

export type TranslationStatus = "complete" | "partial" | "empty";

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi"]);

export function isRtlLocale(locale: Locale): boolean {
  return RTL_LANGUAGES.has(locale.split(/[-_]/)[0].toLowerCase());
}

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}

const LOCALE_NAMES: Record<string, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  ar: { label: "Arabic", native: "العربية" },
};

/** "English" / "Arabic" (falls back to the upper-cased code). */
export function localeLabel(locale: Locale): string {
  return LOCALE_NAMES[locale]?.label ?? locale.toUpperCase();
}

/** "العربية" for ar (for tab labels next to the English name). */
export function localeNativeName(locale: Locale): string | null {
  const native = LOCALE_NAMES[locale]?.native;
  return native && native !== LOCALE_NAMES[locale]?.label ? native : null;
}

function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Status of one locale: `complete` (all `fields` filled), `partial` (some), `empty` (none).
 * `fields` defaults to the keys present in the entry.
 */
export function translationStatus<T extends object>(
  value: Translations<T> | null | undefined,
  locale: Locale,
  fields?: ReadonlyArray<keyof T & string>,
): TranslationStatus {
  const entry = (value?.[locale] ?? {}) as Record<string, unknown>;
  const keys = fields ?? Object.keys(entry);
  if (!keys.length) return "empty";
  const count = keys.filter((key) => filled(entry[key])).length;
  if (count === 0) return "empty";
  return count === keys.length ? "complete" : "partial";
}

/** Fields of `fields` that are blank for `locale`. */
export function missingFields<T extends object>(
  value: Translations<T> | null | undefined,
  locale: Locale,
  fields: ReadonlyArray<keyof T & string>,
): Array<keyof T & string> {
  const entry = (value?.[locale] ?? {}) as Record<string, unknown>;
  return fields.filter((key) => !filled(entry[key]));
}

/** Immutable update of one field: `setTranslationField(t, "ar", "title", "…")`. */
export function setTranslationField<T extends object, K extends keyof T & string>(
  value: Translations<T> | null | undefined,
  locale: Locale,
  field: K,
  fieldValue: T[K],
): Translations<T> {
  const current = (value ?? {}) as Translations<T>;
  const entry = { ...(current[locale] ?? {}), [field]: fieldValue } as T;
  return { ...current, [locale]: entry };
}

/**
 * Drop locales whose fields are all blank (the API treats them as "not translated" anyway) and
 * trim nothing else. Handy right before sending.
 */
export function compactTranslations<T extends object>(
  value: Translations<T> | null | undefined,
): Translations<T> {
  const out: Translations<T> = {};
  for (const [locale, entry] of Object.entries(value ?? {})) {
    if (entry && Object.values(entry as Record<string, unknown>).some(filled)) {
      out[locale] = entry as T;
    }
  }
  return out;
}
