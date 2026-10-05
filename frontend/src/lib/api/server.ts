import { unstable_rethrow } from "next/navigation";
import { ApiError, parseApiError } from "./errors";
import { apiPath, type Query } from "./shared";

/**
 * Server-side API access for Server Components, generateMetadata, sitemap, etc.
 * Calls FastAPI directly at API_BASE_URL (default http://localhost:8000), never through /api.
 *
 *   const config = await apiGet<PublicConfig>("/public-config", { revalidate: 300 });
 *   if (!config) { ...render fallback... }
 *
 * The API may be down (e.g. during `next build`): apiGet never throws, it returns null and the
 * caller renders fallback content. Use apiGetResult when you must tell 404 from "API down".
 */

export interface ApiGetOptions {
  /** Appended as `?locale=` (every public endpoint accepts it). */
  locale?: string;
  /** Extra query parameters. */
  query?: Query;
  /**
   * Data cache lifetime in seconds (ISR). Default 60. `0` = no cache (renders the route
   * dynamically), `false` = cache until revalidated by tag.
   */
  revalidate?: number | false;
  /** Cache tags for on-demand revalidation (revalidateTag). */
  tags?: string[];
  /** Abort after this many ms (default 5000) so a hung API cannot block rendering. */
  timeoutMs?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function serverApiBaseUrl(): string {
  return (process.env.API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
}

const DEFAULT_REVALIDATE = 60;
const DEFAULT_TIMEOUT_MS = 5000;

export async function apiGetResult<T>(
  path: string,
  options: ApiGetOptions = {},
): Promise<ApiResult<T>> {
  const { locale, query, revalidate = DEFAULT_REVALIDATE, tags, timeoutMs } = options;
  const url = `${serverApiBaseUrl()}${apiPath(path, { ...query, locale })}`;
  const init: RequestInit = {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
  };
  if (revalidate === 0) {
    init.cache = "no-store";
  } else {
    init.next = { revalidate, ...(tags?.length ? { tags } : {}) };
  }

  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const error = await parseApiError(res);
      logFailure(path, `${res.status} ${error.code}`);
      return { ok: false, error };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    // Let Next.js control-flow errors (dynamic usage, notFound, redirect) propagate.
    unstable_rethrow(err);
    logFailure(path, err instanceof Error ? err.message : String(err));
    return { ok: false, error: ApiError.network(err) };
  }
}

/** GET a public endpoint; `null` on any failure (API down, timeout, non-2xx, bad JSON). */
export async function apiGet<T>(path: string, options: ApiGetOptions = {}): Promise<T | null> {
  const result = await apiGetResult<T>(path, options);
  return result.ok ? result.data : null;
}

const logged = new Set<string>();

function logFailure(path: string, reason: string) {
  // One line per path and reason per process, so a down API does not flood the build log.
  const key = `${path} ${reason}`;
  if (logged.has(key)) return;
  logged.add(key);
  console.warn(`[api] GET ${path} failed (${reason}); rendering fallback content.`);
}
