/** Versioned API prefix; every path passed to the helpers is relative to it (e.g. "/blog"). */
export const API_PREFIX = "/api/v1";

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

/** `"/blog"` + `{page: 1, locale: "ar"}` -> `"/api/v1/blog?page=1&locale=ar"` (null/undefined skipped). */
export function apiPath(path: string, query?: Query): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const full = clean.startsWith(`${API_PREFIX}/`) ? clean : `${API_PREFIX}${clean}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  if (!qs) return full;
  return `${full}${full.includes("?") ? "&" : "?"}${qs}`;
}
