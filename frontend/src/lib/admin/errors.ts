import { isAbortError, toAdminApiError, type AdminApiError } from "./api";
import { formatDuration } from "./format";

/**
 * English messages for admin API error codes (backend codes from docs/ARCHITECTURE.md §6/§10 and
 * the routers). Unknown codes fall back to the API's own (English) message.
 */
const MESSAGES: Record<string, string> = {
  network: "Cannot reach the server. Check your connection and try again.",
  server_error: "The server ran into a problem. Please try again in a moment.",
  http_error: "The request failed. Please try again.",
  invalid_response: "The server sent an unexpected response. Please try again.",
  unauthorized: "Your session has expired. Please sign in again.",
  forbidden: "You don't have permission to do this.",
  csrf_failed: "The request was blocked by the security check. Reload the page and try again.",
  not_found: "Not found. It may have been deleted.",
  validation_error: "Some fields are not valid. Check the highlighted fields.",
  // auth & account
  invalid_credentials: "Incorrect email or password.",
  mfa_required: "Enter the 6-digit code from your authenticator app.",
  invalid_mfa_code: "That code is not valid. Check your authenticator app and try again.",
  invalid_password: "The password is incorrect.",
  mfa_already_enabled: "Two-factor authentication is already enabled.",
  mfa_setup_required: "Start the two-factor setup again: the pending setup has expired.",
  mfa_not_enabled: "Two-factor authentication is not enabled.",
  // users
  email_taken: "An admin user with this email already exists.",
  last_owner: "At least one active owner must remain.",
  self_change_forbidden: "You can't change your own role or deactivate yourself.",
  // content
  slug_taken: "This slug is already in use. Choose another one.",
  code_taken: "A discount with this code already exists.",
  media_in_use: "This image is still used by some content. Remove it there first.",
  file_too_large: "The file is too large (maximum 5 MB).",
  invalid_image: "Upload a valid JPEG, PNG, WEBP or GIF image.",
  image_too_large: "The image dimensions are too large.",
  unsupported_media_type: "Send the image as a file upload.",
  invalid_upload: "The upload could not be read. Try again.",
  // prompts
  draft_exists: "This slot already has a draft. Edit or delete it first.",
  not_draft: "Only drafts can be changed.",
  template_required: "The template must not be empty.",
  invalid_base_version: "The base version does not belong to this slot.",
  ai_unavailable: "The AI service is unavailable right now. Try again later.",
  ai_not_configured: "The AI service is not configured on the server.",
  ai_error: "The AI service returned an error. Try again.",
  // orders & jobs
  order_not_retryable: "This order cannot be retried in its current status.",
  generation_in_progress: "Generation is already in progress for this order.",
  report_not_available: "The report is not available (not ready or already expired).",
  job_not_failed: "Only failed jobs can be retried.",
};

/** Codes whose backend message is more specific than any generic text (e.g. names the setting). */
const PREFER_SERVER_MESSAGE = new Set(["invalid_setting", "invalid_template"]);

/**
 * Human message for anything thrown by `adminApi` (or `null` for an abort, which needs no message).
 *
 *   catch (err) { setError(adminErrorMessage(err)); }
 */
export function adminErrorMessage(err: unknown): string;
export function adminErrorMessage(err: unknown, options: { allowAbort: true }): string | null;
export function adminErrorMessage(err: unknown, options?: { allowAbort?: boolean }): string | null {
  if (isAbortError(err)) return options?.allowAbort ? null : "The request was cancelled.";
  const error: AdminApiError = toAdminApiError(err);

  if (error.isRateLimited) {
    const seconds = error.retryAfterSeconds;
    return seconds
      ? `Too many attempts. Try again in ${formatDuration(seconds)}.`
      : "Too many attempts. Please wait a moment and try again.";
  }
  if (error.code === "validation_error") {
    const first = error.fieldErrors[0];
    if (error.fieldErrors.length === 1 && first?.message) {
      return first.field
        ? `${humanizeField(first.field)}: ${stripPrefix(first.message)}`
        : first.message;
    }
    return MESSAGES.validation_error;
  }
  if (PREFER_SERVER_MESSAGE.has(error.code) && error.message) return error.message;
  if (error.code === "file_too_large") {
    const max = error.details.max_bytes;
    if (typeof max === "number")
      return `The file is too large (maximum ${Math.round(max / 1048576)} MB).`;
  }
  const known = MESSAGES[error.code];
  if (known) return known;
  if (error.message && error.message !== error.code) return error.message;
  return "Something went wrong. Please try again.";
}

/** Pydantic prefixes messages with "Value error, "; drop it for display. */
function stripPrefix(message: string): string {
  return message.replace(/^Value error,\s*/i, "");
}

/** `translations.ar.title` → `Translations › ar › title`; `current_password` → `Current password`. */
export function humanizeField(field: string): string {
  const parts = field.split(".").filter(Boolean);
  if (!parts.length) return field;
  const [first, ...rest] = parts;
  const head = first.replace(/_/g, " ");
  return [head.charAt(0).toUpperCase() + head.slice(1), ...rest].join(" › ");
}

/**
 * `{field: message}` for forms, with pydantic's "Value error, " prefix removed. Dotted paths are
 * kept (`translations.en.title`); look them up with the same path.
 */
export function adminFieldErrors(err: unknown): Record<string, string> {
  if (isAbortError(err)) return {};
  const error = toAdminApiError(err);
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(error.fields)) out[field] = stripPrefix(message);
  return out;
}
