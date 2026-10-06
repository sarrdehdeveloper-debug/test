/**
 * Client-side validation of the reading forms. It mirrors the backend rules
 * (backend/app/free_reading/schemas.py, backend/app/orders/schemas.py) so visitors get instant,
 * localized feedback; the API stays the source of truth and its 422 errors are mapped back onto
 * the same fields (see ./errors.ts).
 *
 * Issues are message *keys* (translated by the components), never English text.
 */

export const MAX_EMAIL_LENGTH = 254;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const MAX_DISCOUNT_CODE_LENGTH = 64;

/** Keys of `form.validation.*` (shared messages) plus the flow-specific `emailMismatch`. */
export type IssueKey =
  | "required"
  | "email"
  | "date"
  | "dateRange"
  | "time"
  | "country"
  | "city"
  | "terms"
  | "tooLong"
  | "emailMismatch";

export interface FieldIssue {
  key: IssueKey;
  /** ICU arguments, e.g. `{min, max}` for dateRange (ISO dates, formatted by the component). */
  values?: Record<string, string | number>;
}

export type FieldIssues<F extends string> = Partial<Record<F, FieldIssue>>;

const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const HH_MM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const HH_MM_SS = /^([01][0-9]|2[0-3]):([0-5][0-9]):[0-5][0-9](\.[0-9]+)?$/;

/** True for a real calendar date written `YYYY-MM-DD` (ASCII digits, like the backend). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Normalise a native time input value to `HH:MM` ("14:30:00" -> "14:30"); "" when invalid. */
export function normalizeTime(value: string): string {
  const trimmed = value.trim();
  if (HH_MM.test(trimmed)) return trimmed;
  if (HH_MM_SS.test(trimmed)) return trimmed.slice(0, 5);
  return "";
}

/**
 * Pragmatic email check: one "@", no spaces, a dotted domain without empty labels.
 * Internationalised addresses are accepted; the backend (email-validator) has the final word.
 */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  const at = email.lastIndexOf("@");
  if (at < 1 || email.indexOf("@") !== at) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (/\s/u.test(email) || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => l.length > 0 && !l.startsWith("-") && !l.endsWith("-"))) return false;
  const tld = labels[labels.length - 1];
  return tld.length >= 2 && !/^[0-9]+$/.test(tld);
}

/** Collapse whitespace like the backend's `clean_display_name` (control characters dropped). */
export function cleanDisplayName(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Length in code points (what Python's `len` counts). */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function validateBirthDate(value: string, min: string, max: string): FieldIssue | null {
  if (!value.trim()) return { key: "required" };
  if (!isIsoDate(value)) return { key: "date" };
  // ISO dates compare correctly as strings.
  if (value < min || value > max) return { key: "dateRange", values: { min, max } };
  return null;
}

export function validateEmail(value: string): FieldIssue | null {
  if (!value.trim()) return { key: "required" };
  return isValidEmail(value) ? null : { key: "email" };
}

export function validateBirthTime(value: string): FieldIssue | null {
  if (!value.trim()) return { key: "required" };
  return normalizeTime(value) ? null : { key: "time" };
}

/** Emails are compared case-insensitively (the backend lower-cases them). */
export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/* --------------------------------------------------------------- free reading */

export type FreeField = "birthDate" | "email" | "language";

export interface FreeFormValues {
  birthDate: string;
  email: string;
  language: string;
}

export interface DateBounds {
  /** `YYYY-MM-DD`, from public-config (`min_birth_date`). */
  min: string;
  /** `YYYY-MM-DD`, today in the visitor's time zone. */
  max: string;
}

export function validateFreeForm(
  values: FreeFormValues,
  bounds: DateBounds,
  locales: readonly string[],
): FieldIssues<FreeField> {
  const issues: FieldIssues<FreeField> = {};
  const date = validateBirthDate(values.birthDate, bounds.min, bounds.max);
  if (date) issues.birthDate = date;
  const email = validateEmail(values.email);
  if (email) issues.email = email;
  if (!locales.includes(values.language)) issues.language = { key: "required" };
  return issues;
}

/* ------------------------------------------------------------------ paid order */

export type OrderField =
  | "displayName"
  | "email"
  | "emailConfirm"
  | "birthDate"
  | "birthTime"
  | "country"
  | "city"
  | "discountCode"
  | "acceptTerms";

export interface OrderFormValues {
  displayName: string;
  email: string;
  emailConfirm: string;
  birthDate: string;
  birthTime: string;
  country: string;
  cityId: number | null;
  discountCode: string;
  acceptTerms: boolean;
}

export function validateOrderForm(
  values: OrderFormValues,
  bounds: DateBounds,
): FieldIssues<OrderField> {
  const issues: FieldIssues<OrderField> = {};
  if (codePointLength(cleanDisplayName(values.displayName)) > MAX_DISPLAY_NAME_LENGTH) {
    issues.displayName = { key: "tooLong", values: { max: MAX_DISPLAY_NAME_LENGTH } };
  }
  const email = validateEmail(values.email);
  if (email) issues.email = email;
  if (!values.emailConfirm.trim()) issues.emailConfirm = { key: "required" };
  else if (!email && !sameEmail(values.email, values.emailConfirm)) {
    issues.emailConfirm = { key: "emailMismatch" };
  }
  const date = validateBirthDate(values.birthDate, bounds.min, bounds.max);
  if (date) issues.birthDate = date;
  const time = validateBirthTime(values.birthTime);
  if (time) issues.birthTime = time;
  if (!values.country) issues.country = { key: "country" };
  else if (values.cityId === null) issues.city = { key: "city" };
  if (values.discountCode.trim().length > MAX_DISCOUNT_CODE_LENGTH) {
    issues.discountCode = { key: "tooLong", values: { max: MAX_DISCOUNT_CODE_LENGTH } };
  }
  if (!values.acceptTerms) issues.acceptTerms = { key: "terms" };
  return issues;
}

/** Normalised discount code as the backend stores it (trimmed, upper case); null when empty. */
export function normalizeDiscountCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return code ? code : null;
}

/** First field (in form order) that has an issue, to move focus there. */
export function firstIssueField<F extends string>(
  issues: FieldIssues<F>,
  order: readonly F[],
): F | null {
  return order.find((field) => issues[field]) ?? null;
}

/** Today as `YYYY-MM-DD` in the visitor's time zone. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
