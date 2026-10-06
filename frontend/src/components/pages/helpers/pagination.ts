/**
 * Pagination math for list pages (`/blog?page=N`). Pure and unit-tested.
 */

/** Largest page number accepted in a URL (matches the API's `page` limit). */
export const MAX_PAGE = 100_000;

/**
 * `?page=` value -> page number. Missing -> 1; anything that is not a plain positive integer
 * ("0", "-1", "2.5", "abc", "01", repeated params) -> null, so the caller can answer 404.
 */
export function parsePageParam(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (Array.isArray(value)) return null;
  if (!/^[1-9]\d{0,5}$/.test(value)) return null;
  const page = Number(value);
  return page <= MAX_PAGE ? page : null;
}

/** Number of pages for `total` items (at least 1, so an empty list still has page 1). */
export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

export type PageItem = number | "gap";

/**
 * Page links to show: always the first and last page, the current page with `siblings` pages on
 * each side, and "gap" markers for skipped ranges. A gap never hides a single page (it shows the
 * page instead), so the number of items stays constant while paging (no layout jump).
 *
 *   paginationItems(5, 10) -> [1, "gap", 4, 5, 6, "gap", 10]
 */
export function paginationItems(current: number, count: number, siblings = 1): PageItem[] {
  if (count <= 1) return [1];
  const page = Math.min(Math.max(1, Math.trunc(current)), count);
  // first + last + current + siblings on both sides + 2 gaps
  const slots = 2 * siblings + 5;
  if (count <= slots) return Array.from({ length: count }, (_, i) => i + 1);

  let start = Math.max(2, page - siblings);
  let end = Math.min(count - 1, page + siblings);
  // Keep the window the same width near the edges.
  const width = 2 * siblings + 1;
  if (page - siblings <= 3) {
    start = 2;
    end = Math.max(end, width + 2);
  } else if (page + siblings >= count - 2) {
    end = count - 1;
    start = Math.min(start, count - width - 1);
  }

  const items: PageItem[] = [1];
  if (start > 2) items.push("gap");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < count - 1) items.push("gap");
  items.push(count);
  return items;
}

/** Locale-less href of a list page: page 1 is the bare path (one canonical URL), others `?page=N`. */
export function pageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}
