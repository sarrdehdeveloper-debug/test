import {
  ambiguousTimeOptions,
  discountErrorReason,
  isApiError,
  suggestedTime,
  type ApiError,
} from "@/lib/api/errors";
import type { AmbiguousTimeOption, DiscountErrorReason } from "@/lib/types";
import {
  MAX_DISCOUNT_CODE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  type FieldIssue,
  type FieldIssues,
  type FreeField,
  type OrderField,
} from "./validation";

/**
 * Turns API errors of the reading flows into UI state. Backend validation messages are English
 * pydantic text, so they are replaced by the localized `form.validation.*` keys per field.
 */

/** What a field-level problem reported by the API means for the visitor. */
const API_FIELD_ISSUES: Record<string, { field: OrderField; issue: FieldIssue }> = {
  email: { field: "email", issue: { key: "email" } },
  birth_date: { field: "birthDate", issue: { key: "date" } },
  birth_time: { field: "birthTime", issue: { key: "time" } },
  time_fold: { field: "birthTime", issue: { key: "time" } },
  city_id: { field: "city", issue: { key: "city" } },
  display_name: {
    field: "displayName",
    issue: { key: "tooLong", values: { max: MAX_DISPLAY_NAME_LENGTH } },
  },
  discount_code: {
    field: "discountCode",
    issue: { key: "tooLong", values: { max: MAX_DISCOUNT_CODE_LENGTH } },
  },
  accept_terms: { field: "acceptTerms", issue: { key: "terms" } },
};

function apiFieldIssues(err: ApiError): FieldIssues<OrderField> {
  const issues: FieldIssues<OrderField> = {};
  for (const { field } of err.fieldErrors) {
    // "birth_date" or nested paths such as "body.birth_date" -> last segment.
    const name = field.split(".").pop() ?? field;
    const mapped = API_FIELD_ISSUES[name];
    if (mapped && !issues[mapped.field]) issues[mapped.field] = mapped.issue;
  }
  return issues;
}

function dateRangeIssue(err: ApiError, fallbackMin: string, fallbackMax: string): FieldIssue {
  const min = typeof err.details.earliest === "string" ? err.details.earliest : fallbackMin;
  const max = typeof err.details.latest === "string" ? err.details.latest : fallbackMax;
  return { key: "dateRange", values: { min, max } };
}

/* --------------------------------------------------------------- free reading */

export type FreeSubmitError =
  | { kind: "fields"; issues: FieldIssues<FreeField> }
  /** Anything else: shown as a form-level alert (network, rate limit, server...). */
  | { kind: "form"; error: unknown };

export function mapFreeReadingError(
  err: unknown,
  bounds: { min: string; max: string },
): FreeSubmitError {
  if (!isApiError(err)) return { kind: "form", error: err };
  if (err.code === "birth_date_out_of_range") {
    return { kind: "fields", issues: { birthDate: dateRangeIssue(err, bounds.min, bounds.max) } };
  }
  if (err.code === "validation_error") {
    const all = apiFieldIssues(err);
    const issues: FieldIssues<FreeField> = {};
    if (all.birthDate) issues.birthDate = all.birthDate;
    if (all.email) issues.email = all.email;
    if (Object.keys(issues).length > 0) return { kind: "fields", issues };
  }
  return { kind: "form", error: err };
}

/* ------------------------------------------------------------------ paid order */

export type OrderSubmitError =
  /** DST fall-back: the wall time happened twice; ask which one and resend with `time_fold`. */
  | { kind: "ambiguousTime"; options: AmbiguousTimeOption[] }
  /** DST spring-forward: the wall time never happened; offer the suggested time. */
  | { kind: "nonexistentTime"; suggestedTime: string | null }
  | { kind: "fields"; issues: FieldIssues<OrderField> }
  | { kind: "discount"; reason: DiscountErrorReason | null }
  /** The chosen city has unusable place data: ask for another one. */
  | { kind: "invalidPlace" }
  | { kind: "form"; error: unknown };

export function mapOrderError(
  err: unknown,
  bounds: { min: string; max: string },
): OrderSubmitError {
  if (!isApiError(err)) return { kind: "form", error: err };
  switch (err.code) {
    case "ambiguous_local_time": {
      const options = ambiguousTimeOptions(err).filter((o) => o.fold === 0 || o.fold === 1);
      return options.length > 0 ? { kind: "ambiguousTime", options } : { kind: "form", error: err };
    }
    case "nonexistent_local_time":
      return { kind: "nonexistentTime", suggestedTime: suggestedTime(err) };
    case "invalid_discount_code":
      return { kind: "discount", reason: discountErrorReason(err) };
    case "birth_date_out_of_range":
      return {
        kind: "fields",
        issues: { birthDate: dateRangeIssue(err, bounds.min, bounds.max) },
      };
    case "terms_not_accepted":
      return { kind: "fields", issues: { acceptTerms: { key: "terms" } } };
    case "invalid_place":
      return { kind: "invalidPlace" };
    case "validation_error": {
      const issues = apiFieldIssues(err);
      if (Object.keys(issues).length > 0) return { kind: "fields", issues };
      return { kind: "form", error: err };
    }
    case "not_found":
      // The only 404 of POST /orders is an unknown city (e.g. the place list was re-imported).
      return { kind: "fields", issues: { city: { key: "city" } } };
    default:
      return { kind: "form", error: err };
  }
}

/* ---------------------------------------------------------------- downloads */

export type DownloadProblem = "invalidLink" | "notReady" | "expired" | "rateLimited" | "failed";

/** GET /reports/{id}/download: 404 bad token/order, 409 not ready, 410 expired. */
export function downloadProblem(err: unknown): DownloadProblem {
  if (!isApiError(err)) return "failed";
  if (err.status === 404) return "invalidLink";
  if (err.status === 409 || err.code === "report_not_ready") return "notReady";
  if (err.status === 410 || err.code === "report_expired") return "expired";
  if (err.isRateLimited) return "rateLimited";
  return "failed";
}

/** Whole minutes to wait after a 429 (from Retry-After), at least 1; null when unknown. */
export function retryAfterMinutes(err: unknown): number | null {
  if (!isApiError(err) || !err.isRateLimited || err.retryAfter === null) return null;
  return Math.max(1, Math.ceil(err.retryAfter / 60));
}
