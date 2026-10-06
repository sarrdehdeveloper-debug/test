/**
 * Pure helpers shared by the content editors (offers, discounts, library, blog): slug and link
 * validation mirroring the backend (`backend/app/content/schemas.py`), PATCH diffs, translation
 * checks and API field-error normalisation. Everything here is framework-free and unit tested.
 */
import { humanizeField } from "@/lib/admin/errors";
import { localeLabel } from "@/lib/admin/translations";
import type { Locale, Translations } from "@/lib/admin/types";

/* ================================================================== limits (backend schemas) */

export const LIMITS = {
  slug: 120,
  postSlug: 160,
  title: 200,
  shortText: 300,
  excerpt: 500,
  label: 80,
  markdown: 20_000,
  longMarkdown: 100_000,
  link: 500,
  sortOrder: 1_000_000,
} as const;

/* ================================================================== slugs & links */

/** "Launch Offer: 10% off!" → "launch-offer-10-off" (Latin letters/digits only, max `max`). */
export function slugify(text: string, max: number = LIMITS.slug): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Backend rule: 2–`max` characters of `[a-z0-9-]` (input is lower-cased and trimmed first). */
export function validateSlug(value: string, max: number = LIMITS.slug): string | null {
  const slug = value.trim().toLowerCase();
  if (!slug) return "Enter a slug.";
  if (slug.length < 2 || slug.length > max) return `Use 2–${max} characters.`;
  if (!/^[a-z0-9-]+$/.test(slug)) return "Use lower-case letters, digits and hyphens only.";
  return null;
}

/**
 * `LinkUrl` of the API: a site-relative path (`/reading`) or an absolute http(s) URL, without
 * spaces, control characters or backslashes, at most 500 characters. Empty → null (optional).
 */
export function validateLink(value: string): string | null {
  const url = value.trim();
  if (!url) return null;
  if (url.length > LIMITS.link) return `Use at most ${LIMITS.link} characters.`;
  if (/[\s\\\u0000-\u001f\u007f]/.test(url)) return "Remove spaces and backslashes.";
  if (url.startsWith("/")) {
    return url.startsWith("//") ? "Use a site path like /reading or an https:// URL." : null;
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host) return null;
  } catch {
    // fall through
  }
  return "Use a site path like /reading or an https:// URL.";
}

/** "" → null, otherwise the trimmed text. */
export function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

/* ================================================================== numbers & dates */

/** Sort order text → integer in ±1 000 000; "" → 0; anything else → undefined (invalid). */
export function parseSortOrder(text: string): number | undefined {
  const value = text.trim();
  if (!value) return 0;
  if (!/^-?\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Math.abs(n) <= LIMITS.sortOrder ? n : undefined;
}

/** "ends_at must be after starts_at" check on ISO strings (null = open). */
export function windowError(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt || !endsAt) return null;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end <= start ? "The end must be after the start." : null;
}

/* ================================================================== equality & diffs */

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Deep equality for plain JSON values (key order does not matter). */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

/**
 * Fields of `current` that differ from `original` (deep comparison per top-level key) — the body
 * of a PATCH request. Keys missing from `current` are ignored.
 */
export function diffFields<T extends object>(original: T, current: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (!isSameValue(original[key], current[key])) out[key] = current[key];
  }
  return out;
}

/* ================================================================== translations */

/**
 * Trim every string field and drop locales whose fields are all blank (= "not translated"); the
 * API does the same, so the payload matches what will be stored.
 */
export function cleanTranslations<T extends object>(
  value: Translations<T> | null | undefined,
): Translations<T> {
  const out: Translations<T> = {};
  for (const [locale, entry] of Object.entries(value ?? {})) {
    if (!entry) continue;
    const trimmed = Object.fromEntries(
      Object.entries(entry as Record<string, unknown>).map(([field, fieldValue]) => [
        field,
        typeof fieldValue === "string" ? fieldValue.trim() : fieldValue,
      ]),
    );
    if (Object.values(trimmed).some((v) => typeof v === "string" && v !== "")) {
      out[locale] = trimmed as T;
    }
  }
  return out;
}

/** Full entry per locale with every field present ("" when missing), for controlled inputs. */
export function fillTranslations<T extends object>(
  value: Translations<Partial<T>> | Record<string, unknown> | null | undefined,
  locales: Locale[],
  fields: ReadonlyArray<keyof T & string>,
): Translations<T> {
  const source = (value ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const out: Translations<T> = {};
  const all = [...locales, ...Object.keys(source).filter((l) => !locales.includes(l))];
  for (const locale of all) {
    const entry = source[locale] ?? {};
    out[locale] = Object.fromEntries(
      fields.map((field) => [field, typeof entry[field] === "string" ? entry[field] : ""]),
    ) as unknown as T;
  }
  return out;
}

export interface TranslationRules<T> {
  defaultLocale: Locale;
  /** Max length per field (characters). */
  maxLengths?: Partial<Record<keyof T & string, number>>;
  /** Field name used in messages (default "title"). */
  titleField?: keyof T & string;
}

/**
 * Client-side version of the API's `check_translations`: the default locale needs a title, and a
 * partially filled locale needs one too. Errors are keyed `translations.<locale>.<field>`.
 */
export function validateTranslations<T extends object>(
  value: Translations<T> | null | undefined,
  rules: TranslationRules<T>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const titleField = (rules.titleField ?? "title") as keyof T & string;
  const cleaned = cleanTranslations(value);
  for (const [locale, entry] of Object.entries(value ?? {})) {
    if (!entry) continue;
    const record = entry as Record<string, unknown>;
    for (const [field, max] of Object.entries(rules.maxLengths ?? {}) as Array<[string, number]>) {
      const text = record[field];
      if (typeof text === "string" && text.trim().length > max) {
        errors[`translations.${locale}.${field}`] =
          `Use at most ${max.toLocaleString("en-US")} characters.`;
      }
    }
    const filled = cleaned[locale] as Record<string, unknown> | undefined;
    if (filled && !filled[titleField] && locale !== rules.defaultLocale) {
      errors[`translations.${locale}.${titleField}`] ??=
        "Add a title, or clear this language to leave it untranslated.";
    }
  }
  const defaultEntry = cleaned[rules.defaultLocale] as Record<string, unknown> | undefined;
  if (!defaultEntry?.[titleField]) {
    errors[`translations.${rules.defaultLocale}.${titleField}`] ??= "A title is required.";
  }
  return errors;
}

/**
 * Normalise API field errors (`adminFieldErrors(err)`): the translations validator reports on the
 * whole `translations` field ("Translation 'ar' needs a title", "A title in the default locale
 * (en) is required"), which is moved to `translations.<locale>.title` so it shows on the input.
 */
export function normalizeFieldErrors(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(fields)) {
    if (field === "translations") {
      const locale =
        /Translation '([a-zA-Z_-]+)'/.exec(message)?.[1] ??
        /default locale \(([a-zA-Z_-]+)\)/.exec(message)?.[1];
      if (locale) {
        out[`translations.${locale}.title`] = /required/.test(message)
          ? "A title is required."
          : "Add a title, or clear this language to leave it untranslated.";
        continue;
      }
    }
    out[field] = message;
  }
  return out;
}

/** Locales that have at least one error (`translations.<locale>.…`), for TranslationTabs. */
export function errorLocales(errors: Record<string, string>): Locale[] {
  const found = new Set<Locale>();
  for (const key of Object.keys(errors)) {
    const match = /^translations\.([^.]+)/.exec(key);
    if (match) found.add(match[1]);
  }
  return [...found];
}

/** Error of `translations.<locale>.<field>`. */
export function translationError(
  errors: Record<string, string>,
  locale: Locale,
  field: string,
): string | undefined {
  return errors[`translations.${locale}.${field}`];
}

/** Merge client and server errors (server wins), dropping empty messages. */
export function mergeErrors(
  ...sources: Array<Record<string, string | null | undefined> | null | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of sources) {
    for (const [key, message] of Object.entries(source ?? {})) if (message) out[key] = message;
  }
  return out;
}

/** Remove the errors of a field (and its children) once the user edits it. */
export function clearErrors(
  errors: Record<string, string>,
  ...prefixes: string[]
): Record<string, string> {
  const keys = Object.keys(errors);
  const drop = keys.filter((key) =>
    prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`)),
  );
  if (!drop.length) return errors;
  const out = { ...errors };
  for (const key of drop) delete out[key];
  return out;
}

/** Character counter state for SEO-style soft limits. */
export function counterTone(length: number, max: number): "ok" | "near" | "over" {
  if (length > max) return "over";
  return length >= Math.round(max * 0.9) ? "near" : "ok";
}

/** "translations.ar.title" → "Arabic title", "cta_url" → "Cta url" (for error summaries). */
export function fieldLabel(key: string, labels: Record<string, string> = {}): string {
  if (labels[key]) return labels[key];
  const match = /^translations\.([^.]+)\.(.+)$/.exec(key);
  if (match)
    return `${localeLabel(match[1])} ${(labels[match[2]] ?? match[2]).replace(/_/g, " ").toLowerCase()}`;
  return humanizeField(key);
}

/** "Slug: Another book already uses this slug." lines for an error alert. */
export function errorSummary(
  errors: Record<string, string>,
  labels: Record<string, string> = {},
): string[] {
  return Object.entries(errors).map(([key, message]) => `${fieldLabel(key, labels)}: ${message}`);
}
