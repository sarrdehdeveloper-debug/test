/** Pagination maths shared by <Pagination> and list pages. */

export function totalPages(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** "Showing 21–40 of 132" bounds (1-based, inclusive; 0–0 when empty). */
export function pageBounds(page: number, pageSize: number, total: number): [number, number] {
  if (total <= 0) return [0, 0];
  const start = (page - 1) * pageSize + 1;
  return [Math.min(start, total), Math.min(page * pageSize, total)];
}

/**
 * Page numbers to show, with `"…"` gaps: always first, last, current and `siblings` around it.
 * paginationRange(6, 12) → [1, "…", 5, 6, 7, "…", 12]
 */
export function paginationRange(page: number, pages: number, siblings = 1): Array<number | "…"> {
  if (pages <= 0) return [];
  const current = Math.min(Math.max(1, page), pages);
  // Small sets: show everything (first + last + current + siblings + 2 gaps).
  if (pages <= 5 + siblings * 2) return Array.from({ length: pages }, (_, i) => i + 1);
  const left = Math.max(2, current - siblings);
  const right = Math.min(pages - 1, current + siblings);
  const out: Array<number | "…"> = [1];
  if (left > 2) out.push(left === 3 ? 2 : "…");
  for (let n = left; n <= right; n += 1) out.push(n);
  if (right < pages - 1) out.push(right === pages - 2 ? pages - 1 : "…");
  out.push(pages);
  return out;
}

/** Parse a `?page=` value: positive integer, else 1. */
export function parsePage(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
