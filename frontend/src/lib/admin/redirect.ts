/** Login redirects: only same-origin `/admin` paths are accepted as `?next=` targets. */

export const ADMIN_HOME = "/admin";
export const ADMIN_LOGIN = "/admin/login";

/**
 * Sanitise a `?next=` value: returns a same-origin path under `/admin` (with its query/hash), or
 * `fallback`. Rejects absolute / protocol-relative URLs, backslashes, control characters and the
 * login page itself (no redirect loop).
 */
export function safeNextPath(next: string | null | undefined, fallback = ADMIN_HOME): string {
  if (!next || typeof next !== "string") return fallback;
  if (next.length > 2000) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  let url: URL;
  try {
    url = new URL(next, "http://admin.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://admin.invalid") return fallback;
  const path = url.pathname;
  if (path !== ADMIN_HOME && !path.startsWith(`${ADMIN_HOME}/`)) return fallback;
  if (path === ADMIN_LOGIN || path.startsWith(`${ADMIN_LOGIN}/`)) return fallback;
  return `${path}${url.search}${url.hash}`;
}

/** `/admin/login?next=<current path>` (the `next` is omitted for the dashboard home). */
export function loginHref(next?: string | null): string {
  const target = next ? safeNextPath(next, "") : "";
  if (!target || target === ADMIN_HOME) return ADMIN_LOGIN;
  return `${ADMIN_LOGIN}?next=${encodeURIComponent(target)}`;
}
