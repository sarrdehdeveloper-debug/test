/**
 * Pure logic of the site-content editor (/admin/content): grouping, control choice, filtering and
 * per-locale dirty tracking of `{key: value}` maps (GET/PUT /admin/site-content).
 */
import { splitLines } from "@/lib/content-core";
import type { ContentKey, Locale } from "@/lib/admin/types";

/** Value map of one locale. */
export type ContentValues = Record<string, string>;
/** Value maps of every locale. */
export type ContentByLocale = Record<Locale, ContentValues>;

export interface ContentGroupInfo {
  label: string;
  description: string;
}

/** Group order and labels (keys' first segment, see backend/app/content/keys.py). */
export const CONTENT_GROUPS: Record<string, ContentGroupInfo> = {
  home: {
    label: "Home page",
    description: "Hero, traditions, steps, plans, FAQ and closing call.",
  },
  free: { label: "Free reading", description: "Intro of the free reading page." },
  reading: {
    label: "Full report",
    description: "Intro, contents and privacy note of the paid form.",
  },
  offers: { label: "Offers page", description: "Intro of the offers page." },
  library: { label: "Galaxy Library", description: "Intro of the library page." },
  blog: { label: "Blog", description: "Intro of the blog page." },
  legal: { label: "Legal", description: "Disclaimer, privacy policy and terms of service." },
  contact: { label: "Contact", description: "Text of the contact page." },
  company: {
    label: "Company details",
    description: "Name, address, phone and email (footer, legal pages).",
  },
  footer: { label: "Footer", description: "Tagline under the logo." },
  seo: { label: "SEO", description: "Search-engine title and description of the home page." },
};

export const CONTENT_GROUP_ORDER = Object.keys(CONTENT_GROUPS);

export function groupInfo(group: string): ContentGroupInfo {
  return (
    CONTENT_GROUPS[group] ?? {
      label: group.charAt(0).toUpperCase() + group.slice(1),
      description: "",
    }
  );
}

export interface ContentGroup {
  group: string;
  label: string;
  description: string;
  keys: ContentKey[];
}

/** Keys grouped in the canonical group order (unknown groups last, API order kept inside groups). */
export function groupKeys(keys: ContentKey[]): ContentGroup[] {
  const byGroup = new Map<string, ContentKey[]>();
  for (const key of keys) {
    const list = byGroup.get(key.group) ?? [];
    list.push(key);
    byGroup.set(key.group, list);
  }
  const order = [
    ...CONTENT_GROUP_ORDER.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !CONTENT_GROUP_ORDER.includes(g)),
  ];
  return order.map((group) => ({ group, ...groupInfo(group), keys: byGroup.get(group) ?? [] }));
}

/* ================================================================== controls */

export type ContentControl = "input" | "textarea" | "lines" | "markdown";

const SHORT_TEXT = /(^|\.)(eyebrow|title|cta_free|cta_paid|name|phone|email|q\d+)$/;

/** Which control edits a key: markdown editor, list textarea, single line or paragraph. */
export function contentControl(key: Pick<ContentKey, "key" | "format">): ContentControl {
  if (key.format === "markdown") return "markdown";
  if (key.format === "lines") return "lines";
  return SHORT_TEXT.test(key.key) ? "input" : "textarea";
}

/** Readable key path without the group: "home.hero.title" → "hero › title". */
export function keyPath(key: string): string {
  return key.split(".").slice(1).join(" › ") || key;
}

/** Number of non-empty lines of a `lines` value (what the public site renders as list items). */
export function lineCount(value: string): number {
  return splitLines(value).length;
}

/* ================================================================== translation state */

export type KeyTranslationState = "complete" | "untranslated" | "empty";

const filled = (value: string | undefined) => Boolean(value && value.trim());

/**
 * `complete`: every locale has text; `untranslated`: some locales are empty (visitors see the
 * default-locale text, or the site's built-in copy); `empty`: no locale has text.
 */
export function keyTranslationState(
  values: Record<Locale, string | undefined>,
  locales: Locale[],
): KeyTranslationState {
  const count = locales.filter((locale) => filled(values[locale])).length;
  if (count === locales.length) return "complete";
  return count === 0 ? "empty" : "untranslated";
}

/** Locales whose value is empty for `key` while another locale has text. */
export function missingLocales(drafts: ContentByLocale, key: string, locales: Locale[]): Locale[] {
  const values = Object.fromEntries(locales.map((l) => [l, drafts[l]?.[key]]));
  if (keyTranslationState(values, locales) !== "untranslated") return [];
  return locales.filter((locale) => !filled(values[locale]));
}

/* ================================================================== dirty tracking */

/** Keys of `draft` whose value differs from `original` → the `items` of a PUT. */
export function changedItems(original: ContentValues, draft: ContentValues): ContentValues {
  const out: ContentValues = {};
  for (const [key, value] of Object.entries(draft)) {
    if ((original[key] ?? "") !== value) out[key] = value;
  }
  return out;
}

/** Changed-key count per locale. */
export function countChanges(
  originals: ContentByLocale,
  drafts: ContentByLocale,
  locales: Locale[],
): Record<Locale, number> {
  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      Object.keys(changedItems(originals[locale] ?? {}, drafts[locale] ?? {})).length,
    ]),
  );
}

export function isKeyChanged(
  originals: ContentByLocale,
  drafts: ContentByLocale,
  key: string,
  locale: Locale,
): boolean {
  return (originals[locale]?.[key] ?? "") !== (drafts[locale]?.[key] ?? "");
}

/**
 * After a successful PUT: the server's values become the new original; keys that were sent and
 * not edited again meanwhile take the stored (trimmed) value, other edits are kept.
 */
export function applySaved(
  draft: ContentValues,
  sent: ContentValues,
  saved: ContentValues,
): ContentValues {
  const next = { ...draft };
  for (const [key, value] of Object.entries(sent)) {
    if (draft[key] === value && key in saved) next[key] = saved[key];
  }
  return next;
}

/* ================================================================== filtering */

export interface ContentFilter {
  query: string;
  group: string;
  /** Only keys with an empty locale while another has text (or completely empty keys). */
  untranslated: boolean;
  /** Only keys with unsaved edits. */
  changed: boolean;
}

export const EMPTY_FILTER: ContentFilter = {
  query: "",
  group: "",
  untranslated: false,
  changed: false,
};

/** Keys matching the filter: text search over key, description and every locale's value. */
export function filterKeys(
  keys: ContentKey[],
  filter: ContentFilter,
  originals: ContentByLocale,
  drafts: ContentByLocale,
  locales: Locale[],
): ContentKey[] {
  const needle = filter.query.trim().toLowerCase();
  return keys.filter((key) => {
    if (filter.group && key.group !== filter.group) return false;
    if (filter.untranslated) {
      const values = Object.fromEntries(locales.map((l) => [l, drafts[l]?.[key.key]]));
      if (keyTranslationState(values, locales) === "complete") return false;
    }
    if (filter.changed && !locales.some((l) => isKeyChanged(originals, drafts, key.key, l))) {
      return false;
    }
    if (!needle) return true;
    if (key.key.toLowerCase().includes(needle)) return true;
    if (key.description.toLowerCase().includes(needle)) return true;
    return locales.some((l) => (drafts[l]?.[key.key] ?? "").toLowerCase().includes(needle));
  });
}

/** Number of keys that are not complete in every locale. */
export function untranslatedCount(
  keys: ContentKey[],
  drafts: ContentByLocale,
  locales: Locale[],
): number {
  return keys.filter((key) => {
    const values = Object.fromEntries(locales.map((l) => [l, drafts[l]?.[key.key]]));
    return keyTranslationState(values, locales) !== "complete";
  }).length;
}

/** "English 2 · Arabic 1" summary of unsaved changes. */
export function changeSummary(
  counts: Record<Locale, number>,
  label: (locale: Locale) => string,
): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([locale, n]) => `${label(locale)} ${n}`)
    .join(" · ");
}
