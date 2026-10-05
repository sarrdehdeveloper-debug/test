import { ApiError, parseApiError } from "./errors";
import { apiPath, type Query } from "./shared";

/**
 * Browser-side API access for Client Components. Uses relative `/api/v1/...` URLs on the Next.js
 * origin (proxied to FastAPI by the rewrite in next.config.ts), so admin cookies stay first-party.
 * Throws ApiError on failure; show it with `useApiErrorMessage()`.
 *
 *   const result = await api.post<FreeReadingResult>("/free-reading", body);
 *   const status = await api.get<OrderStatusOut>(`/orders/${id}`, { headers: { "X-Order-Token": t } });
 */

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serialised as JSON unless it is FormData / Blob / string. */
  body?: unknown;
  query?: Query;
  /** Appended as `?locale=`. */
  locale?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /** Return the raw Response (e.g. PDF downloads) instead of parsed JSON. */
  raw?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, locale, signal, raw } = options;
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData || body instanceof Blob || typeof body === "string") {
      payload = body as BodyInit;
    } else {
      headers.set("Content-Type", "application/json");
      payload = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(apiPath(path, { ...query, locale }), {
      method,
      headers,
      body: payload,
      signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw ApiError.network(err);
  }

  if (!res.ok) throw await parseApiError(res);
  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

type BodylessOptions = Omit<ApiRequestOptions, "method" | "body">;

export const api = {
  get: <T>(path: string, options?: BodylessOptions) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: BodylessOptions) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: BodylessOptions) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: BodylessOptions) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: BodylessOptions) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
