import type {
  AmbiguousTimeOption,
  ApiErrorBody,
  ApiFieldError,
  DiscountErrorReason,
} from "@/lib/types";

/**
 * Error thrown by the client API helper (and returned by `apiGetResult` on the server).
 * `code` is the API's snake_case error code, or one of the synthetic codes below:
 *  - `network`      the request never got a response (offline, DNS, timeout)
 *  - `server_error` 5xx without a JSON error body
 *  - `http_error`   any other non-JSON error response
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  /** Seconds, from the `Retry-After` header of a 429 response. */
  readonly retryAfter: number | null;

  constructor(
    status: number,
    code: string,
    message?: string,
    details: Record<string, unknown> = {},
    retryAfter: number | null = null,
  ) {
    super(message || code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }

  static network(cause?: unknown): ApiError {
    const err = new ApiError(0, "network", "Network request failed");
    if (cause !== undefined) (err as { cause?: unknown }).cause = cause;
    return err;
  }

  get isNetwork(): boolean {
    return this.code === "network";
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.code === "rate_limited";
  }

  /** `details.fields` of a 422 `validation_error`. */
  get fieldErrors(): ApiFieldError[] {
    const fields = this.details.fields;
    return Array.isArray(fields) ? (fields as ApiFieldError[]) : [];
  }

  /** Map of field name -> first message, handy for forms. */
  fieldErrorMap(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.fieldErrors) {
      if (f.field && !(f.field in out)) out[f.field] = f.message;
    }
    return out;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object") return false;
  const error = (value as { error?: unknown }).error;
  return (
    !!error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
  );
}

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000));
}

/** Build an ApiError from a non-OK response, reading the contract's JSON error body when present. */
export async function parseApiError(res: Response): Promise<ApiError> {
  const retryAfter = parseRetryAfter(res);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (isApiErrorBody(body)) {
    const { code, message, details } = body.error;
    return new ApiError(res.status, code, message, details ?? {}, retryAfter);
  }
  if (res.status === 429) return new ApiError(429, "rate_limited", res.statusText, {}, retryAfter);
  if (res.status === 404) return new ApiError(404, "not_found", res.statusText);
  if (res.status >= 500) return new ApiError(res.status, "server_error", res.statusText);
  return new ApiError(res.status, "http_error", res.statusText);
}

/* ------------------------------------------------- typed `details` helpers */

/** Options for a 422 `ambiguous_local_time` (DST fall-back): ask the user, resend with `time_fold`. */
export function ambiguousTimeOptions(err: ApiError): AmbiguousTimeOption[] {
  if (err.code !== "ambiguous_local_time") return [];
  const options = err.details.options;
  return Array.isArray(options) ? (options as AmbiguousTimeOption[]) : [];
}

/** Suggested `HH:MM` for a 422 `nonexistent_local_time` (DST spring-forward gap). */
export function suggestedTime(err: ApiError): string | null {
  if (err.code !== "nonexistent_local_time") return null;
  const value = err.details.suggested_time;
  return typeof value === "string" ? value : null;
}

const DISCOUNT_REASONS: readonly DiscountErrorReason[] = [
  "not_found",
  "inactive",
  "not_started",
  "expired",
  "exhausted",
  "currency_mismatch",
];

/** Reason of a 422 `invalid_discount_code`. */
export function discountErrorReason(err: ApiError): DiscountErrorReason | null {
  if (err.code !== "invalid_discount_code") return null;
  const reason = err.details.reason;
  return DISCOUNT_REASONS.includes(reason as DiscountErrorReason)
    ? (reason as DiscountErrorReason)
    : null;
}

/** Error codes that have their own message in messages/<locale>.json under `errors`. */
export const LOCALIZED_ERROR_CODES = [
  "network",
  "rate_limited",
  "server_error",
  "not_found",
  "validation_error",
  "unauthorized",
  "forbidden",
  "birth_date_out_of_range",
  "terms_not_accepted",
  "invalid_discount_code",
  "ambiguous_local_time",
  "report_expired",
  "report_not_ready",
] as const;
export type LocalizedErrorCode = (typeof LOCALIZED_ERROR_CODES)[number];

export function localizedErrorCode(code: string): LocalizedErrorCode | "generic" {
  return (LOCALIZED_ERROR_CODES as readonly string[]).includes(code)
    ? (code as LocalizedErrorCode)
    : "generic";
}
