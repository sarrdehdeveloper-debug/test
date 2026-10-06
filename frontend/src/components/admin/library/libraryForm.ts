/**
 * Galaxy Library form models (series and books) and reordering helpers.
 */
import type {
  BookAdmin,
  BookCreate,
  LibraryTranslation,
  Locale,
  SeriesAdmin,
  SeriesCreate,
  Translations,
} from "@/lib/admin/types";
import {
  cleanTranslations,
  diffFields,
  emptyToNull,
  fillTranslations,
  LIMITS,
  parseSortOrder,
  validateLink,
  validateSlug,
  validateTranslations,
} from "../content/forms";

export const LIBRARY_FIELDS = ["title", "description"] as const;

export type LibraryEntity = "series" | "book";

export interface LibraryFormValues {
  slug: string;
  translations: Translations<LibraryTranslation>;
  cover_image_url: string | null;
  /** Books only (ignored for series). */
  purchase_url: string;
  is_published: boolean;
  sort_order: string;
}

export function libraryToForm(
  row: SeriesAdmin | BookAdmin | null,
  locales: Locale[],
  defaults: { sort_order?: number } = {},
): LibraryFormValues {
  return {
    slug: row?.slug ?? "",
    translations: fillTranslations<LibraryTranslation>(row?.translations, locales, LIBRARY_FIELDS),
    cover_image_url: row?.cover_image_url ?? null,
    purchase_url: row && "purchase_url" in row ? (row.purchase_url ?? "") : "",
    is_published: row?.is_published ?? false,
    sort_order: String(row?.sort_order ?? defaults.sort_order ?? 0),
  };
}

export function seriesPayload(values: LibraryFormValues): SeriesCreate {
  return {
    slug: values.slug.trim().toLowerCase(),
    translations: cleanTranslations(values.translations),
    cover_image_url: emptyToNull(values.cover_image_url),
    is_published: values.is_published,
    sort_order: parseSortOrder(values.sort_order) ?? 0,
  };
}

export function bookPayload(values: LibraryFormValues): BookCreate {
  return { ...seriesPayload(values), purchase_url: emptyToNull(values.purchase_url) };
}

export function libraryPayload(entity: LibraryEntity, values: LibraryFormValues) {
  return entity === "book" ? bookPayload(values) : seriesPayload(values);
}

/** Changed fields only (PATCH body). */
export function libraryPatch(
  entity: LibraryEntity,
  initial: LibraryFormValues,
  values: LibraryFormValues,
): Partial<BookCreate> {
  return diffFields<BookCreate>(libraryPayload(entity, initial), libraryPayload(entity, values));
}

export function validateLibrary(
  entity: LibraryEntity,
  values: LibraryFormValues,
  defaultLocale: Locale,
): Record<string, string> {
  const errors: Record<string, string> = {
    ...validateTranslations<LibraryTranslation>(values.translations, {
      defaultLocale,
      maxLengths: { title: LIMITS.title, description: LIMITS.markdown },
    }),
  };
  const slug = validateSlug(values.slug);
  if (slug) errors.slug = slug;
  if (entity === "book") {
    const link = validateLink(values.purchase_url);
    if (link) errors.purchase_url = link;
  }
  if (parseSortOrder(values.sort_order) === undefined) {
    errors.sort_order = "Enter a whole number between -1,000,000 and 1,000,000.";
  }
  return errors;
}

/* ================================================================== ordering */

interface Ordered {
  id: number;
  sort_order: number;
}

/** Display order used by the API: sort_order, then id. */
export function sortByOrder<T extends Ordered>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

/**
 * Move the item at `index` by `delta` (−1 up, +1 down). Returns the `{id, sort_order}` changes to
 * PATCH (empty when the move is out of range):
 * - neighbours with distinct, unshared sort orders simply swap them (two writes, nothing else moves);
 * - otherwise (ties) the list is renumbered 1..n and only the items that change are returned.
 */
export function moveItem<T extends Ordered>(
  items: T[],
  index: number,
  delta: -1 | 1,
): Array<{ id: number; sort_order: number }> {
  const ordered = sortByOrder(items);
  const target = index + delta;
  if (index < 0 || index >= ordered.length || target < 0 || target >= ordered.length) return [];
  const a = ordered[index];
  const b = ordered[target];
  const shared = (value: number) => ordered.filter((item) => item.sort_order === value).length > 1;
  if (a.sort_order !== b.sort_order && !shared(a.sort_order) && !shared(b.sort_order)) {
    return [
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ];
  }
  const next = [...ordered];
  [next[index], next[target]] = [next[target], next[index]];
  return next
    .map((item, position) => ({ id: item.id, sort_order: position + 1, previous: item.sort_order }))
    .filter((item) => item.sort_order !== item.previous)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}

/** Apply `{id, sort_order}` changes to a list locally (optimistic update). */
export function applyOrder<T extends Ordered>(
  items: T[],
  changes: Array<{ id: number; sort_order: number }>,
): T[] {
  const byId = new Map(changes.map((c) => [c.id, c.sort_order]));
  return sortByOrder(
    items.map((item) => (byId.has(item.id) ? { ...item, sort_order: byId.get(item.id)! } : item)),
  );
}

/** Sort order for a new item: after the last one. */
export function nextSortOrder(items: Ordered[]): number {
  return items.length ? Math.max(...items.map((item) => item.sort_order)) + 1 : 1;
}

/** Default-locale title, falling back to any title and then the slug. */
export function libraryTitle(
  row: { translations: Translations<Partial<LibraryTranslation>>; slug: string },
  locale: Locale,
): string {
  const own = row.translations[locale]?.title?.trim();
  if (own) return own;
  const any = Object.values(row.translations).find((entry) => entry?.title?.trim())?.title;
  return any?.trim() || row.slug;
}
