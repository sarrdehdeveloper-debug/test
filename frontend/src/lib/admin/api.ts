import { ApiError, parseApiError } from "@/lib/api/errors";
import { apiPath, type Query } from "@/lib/api/shared";

/**
 * Typed fetch wrapper for the admin API (Client Components only).
 *
 *   const { user } = await adminApi.get<UserEnvelope>("/auth/me");
 *   const page = await adminApi.get<AdminPage<AdminOrderItem>>("/orders", { query: { page: 2, status } });
 *   await adminApi.patch<OfferAdmin>(`/offers/${id}`, { is_active: false });
 *   const media = await adminApi.upload<MediaItem>("/media", formData, { onProgress: setProgress });
 *
 * - Paths are relative to `/api/v1/admin`; a path that already starts with `/api/` is used as is
 *   (e.g. `"/api/v1/public-config"`).
 * - Same-origin requests through the Next.js `/api` proxy, so the httpOnly session cookie is sent.
 * - Every non-GET request carries `X-ZB-Admin: 1` (the backend's CSRF guard).
 * - Failures throw `AdminApiError` (aborts rethrow the native `AbortError`). A 401 also calls the
 *   handler registered with `setUnauthorizedHandler` (AdminAuthProvider redirects to the login page)
 *   unless `redirectOn401: false` is passed (the login form does that).
 */

export const ADMIN_API_PREFIX = "/api/v1/admin";
export const ADMIN_HEADER = "X-ZB-Admin";

/* ------------------------------------------------------------------ errors */

/**
 * Error of an admin API call. Extends the site-wide `ApiError` (`status`, `code`, `message`,
 * `details`, `retryAfter`, `fieldErrors`, `fieldErrorMap()`), adding:
 * - `fields`: `{field: message}` from `details.fields` (422) — dotted paths like `translations.ar.title`
 *   are kept as sent by the API;
 * - `retryAfterSeconds`: from `details.retry_after_seconds` or the `Retry-After` header;
 * - `isUnauthorized` (401), `isForbidden` (403), `isValidation` (422), `isConflict` (409).
 */
export class AdminApiError extends ApiError {
  readonly fields: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message?: string,
    details: Record<string, unknown> = {},
    retryAfter: number | null = null,
  ) {
    super(status, code, message, details, retryAfter);
    this.name = "AdminApiError";
    this.fields = this.fieldErrorMap();
  }

  static from(err: ApiError): AdminApiError {
    if (err instanceof AdminApiError) return err;
    const next = new AdminApiError(err.status, err.code, err.message, err.details, err.retryAfter);
    if ("cause" in err) (next as { cause?: unknown }).cause = (err as { cause?: unknown }).cause;
    return next;
  }

  static network(cause?: unknown): AdminApiError {
    return AdminApiError.from(ApiError.network(cause));
  }

  get isUnauthorized(): boolean {
    return (
      this.status === 401 &&
      this.code !== "invalid_credentials" &&
      this.code !== "mfa_required" &&
      this.code !== "invalid_mfa_code"
    );
  }

  get isForbidden(): boolean {
    return this.status === 403 && this.code !== "csrf_failed";
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get retryAfterSeconds(): number | null {
    const fromDetails = this.details.retry_after_seconds;
    if (typeof fromDetails === "number" && Number.isFinite(fromDetails)) return fromDetails;
    return this.retryAfter;
  }
}

export function isAdminApiError(value: unknown): value is AdminApiError {
  return value instanceof AdminApiError;
}

/** Normalise anything thrown by a request into an AdminApiError (unknown errors → `client_error`). */
export function toAdminApiError(err: unknown): AdminApiError {
  if (err instanceof AdminApiError) return err;
  if (err instanceof ApiError) return AdminApiError.from(err);
  const message = err instanceof Error ? err.message : String(err);
  return new AdminApiError(0, "client_error", message);
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/* ------------------------------------------------------------------ 401 handling */

type UnauthorizedHandler = (error: AdminApiError) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Register what happens when any admin request gets a 401 (session missing/expired).
 * Returns an unregister function. AdminAuthProvider registers a redirect to `/admin/login?next=…`.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

function notifyUnauthorized(error: AdminApiError, redirectOn401: boolean | undefined) {
  if (redirectOn401 === false || !error.isUnauthorized) return;
  unauthorizedHandler?.(error);
}

/* ------------------------------------------------------------------ requests */

export type AdminMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AdminRequestOptions {
  /** Query string (null/undefined/"" values are skipped). */
  query?: Query;
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** Default true: a 401 triggers the unauthorized handler (redirect to login). */
  redirectOn401?: boolean;
}

/** `"/orders"` + `{page: 2}` → `"/api/v1/admin/orders?page=2"`; `/api/...` paths are kept. */
export function adminPath(path: string, query?: Query): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const full = clean.startsWith("/api/")
    ? clean
    : `${ADMIN_API_PREFIX}${clean === "/" ? "" : clean}`;
  return apiPath(full, query);
}

function buildHeaders(method: AdminMethod, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (method !== "GET") headers.set(ADMIN_HEADER, "1");
  return headers;
}

async function readBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AdminApiError(res.status, "invalid_response", "The server sent an invalid response");
  }
}

/** Low-level request; prefer the `adminApi.*` shortcuts. */
export async function adminRequest<T>(
  method: AdminMethod,
  path: string,
  body?: unknown,
  options: AdminRequestOptions = {},
): Promise<T> {
  const { query, signal, redirectOn401 } = options;
  const headers = buildHeaders(method, options.headers);

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
    res = await fetch(adminPath(path, query), {
      method,
      headers,
      body: payload,
      signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw AdminApiError.network(err);
  }

  if (!res.ok) {
    const error = AdminApiError.from(await parseApiError(res));
    notifyUnauthorized(error, redirectOn401);
    throw error;
  }
  return readBody<T>(res);
}

/* ------------------------------------------------------------------ uploads (XHR for progress) */

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0..1 */
  fraction: number;
}

export interface AdminUploadOptions extends Omit<AdminRequestOptions, "query"> {
  query?: Query;
  /** Called while the body is sent (not called by environments without XHR upload events). */
  onProgress?: (progress: UploadProgress) => void;
  method?: "POST" | "PUT";
}

function headerMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const index = line.indexOf(":");
    if (index > 0) out[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return out;
}

/** Multipart upload with progress events. Resolves with the parsed JSON response. */
export function adminUpload<T>(
  path: string,
  form: FormData,
  options: AdminUploadOptions = {},
): Promise<T> {
  const { onProgress, signal, query, redirectOn401, method = "POST" } = options;
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, adminPath(path, query));
    xhr.withCredentials = true;
    buildHeaders(method, options.headers).forEach((value, key) => xhr.setRequestHeader(key, value));

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;
        onProgress({
          loaded: event.loaded,
          total: event.total,
          fraction: event.total ? event.loaded / event.total : 0,
        });
      });
    }

    xhr.addEventListener("load", () => {
      cleanup();
      const status = xhr.status;
      const res = new Response(status === 204 ? null : xhr.responseText, {
        status: status >= 200 && status <= 599 ? status : 500,
        headers: headerMap(xhr.getAllResponseHeaders()),
      });
      if (res.ok) {
        readBody<T>(res).then(resolve, reject);
        return;
      }
      parseApiError(res).then((parsed) => {
        let error = AdminApiError.from(parsed);
        // A proxy in front of the API may answer 413 without the JSON error body.
        if (status === 413 && error.code === "http_error") {
          error = new AdminApiError(413, "file_too_large", "The file is too large");
        }
        notifyUnauthorized(error, redirectOn401);
        reject(error);
      }, reject);
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(AdminApiError.network());
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    });
    xhr.send(form);
  });
}

/* ------------------------------------------------------------------ public helper */

type BodylessOptions = AdminRequestOptions;

export const adminApi = {
  get: <T>(path: string, options?: BodylessOptions) =>
    adminRequest<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: BodylessOptions) =>
    adminRequest<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: BodylessOptions) =>
    adminRequest<T>("PUT", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: BodylessOptions) =>
    adminRequest<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: BodylessOptions) =>
    adminRequest<T>("DELETE", path, undefined, options),
  /** Multipart upload (FormData) with `onProgress`. */
  upload: <T>(path: string, form: FormData, options?: AdminUploadOptions) =>
    adminUpload<T>(path, form, options),
};
