import { toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { formatDuration, humanize } from "@/lib/admin/format";
import {
  MAX_EXTEND_HOURS,
  type AdminJob,
  type AdminOrderDetail,
  type AdminReport,
  type OrderStatus,
} from "@/lib/admin/types";

/**
 * Order detail logic: which admin actions are possible (mirrors backend/app/orders/admin_service.py),
 * when to keep polling, report access state and friendly 409 messages. Pure and tested.
 */

/** Paid orders whose report is being (or should be) generated. */
export const GENERATING_STATUSES: readonly OrderStatus[] = ["paid", "queued", "generating"];
const ACTIVE_JOB_STATUSES = new Set(["pending", "running"]);

export function hasActiveJob(jobs: AdminJob[], kind?: string): boolean {
  return jobs.some((job) => ACTIVE_JOB_STATUSES.has(job.status) && (!kind || job.kind === kind));
}

/** Keep refreshing the detail page while generation runs or a job is queued (e.g. a resent email). */
export function shouldPollOrder(
  order: Pick<AdminOrderDetail, "status" | "jobs"> | undefined,
): boolean {
  if (!order) return false;
  return GENERATING_STATUSES.includes(order.status) || hasActiveJob(order.jobs);
}

export type ReportAccess =
  | { state: "none" }
  | { state: "deleted"; at: string }
  | { state: "expired"; at: string }
  | { state: "active"; until: string; remainingSeconds: number };

export function reportAccess(report: AdminReport | null, now: number = Date.now()): ReportAccess {
  if (!report) return { state: "none" };
  if (report.deleted_at) return { state: "deleted", at: report.deleted_at };
  const expires = Date.parse(report.expires_at);
  if (!Number.isFinite(expires) || expires <= now)
    return { state: "expired", at: report.expires_at };
  return {
    state: "active",
    until: report.expires_at,
    remainingSeconds: Math.round((expires - now) / 1000),
  };
}

export interface ActionState {
  enabled: boolean;
  /** Why the action is not available (shown under the disabled button). */
  reason: string | null;
}

export interface OrderActions {
  retry: ActionState;
  resend: ActionState;
  extend: ActionState;
}

const on: ActionState = { enabled: true, reason: null };
const off = (reason: string): ActionState => ({ enabled: false, reason });

/** Availability of the three order actions (the server re-checks and may still answer 409). */
export function orderActions(
  order: Pick<AdminOrderDetail, "status" | "report" | "jobs" | "personal_data_purged_at">,
  now: number = Date.now(),
): OrderActions {
  const generatingJob = hasActiveJob(order.jobs, "generate_report");
  let retry: ActionState;
  if (order.status === "generation_failed") {
    retry = generatingJob ? off("A generation job is already queued or running.") : on;
  } else if (GENERATING_STATUSES.includes(order.status)) {
    retry = generatingJob
      ? off("Generation is running. Retry becomes available if it fails or gets stuck.")
      : on;
  } else if (order.status === "ready") {
    retry = off("The report is already generated.");
  } else {
    retry = off(`Only paid orders can be generated (this one is ${statusLabel(order.status)}).`);
  }

  const access = reportAccess(order.report, now);
  let resend: ActionState;
  let extend: ActionState;
  if (order.status !== "ready" || access.state === "none") {
    const reason =
      order.status === "ready" ? "This order has no report file." : "The report isn't ready yet.";
    resend = off(reason);
    extend = off(reason);
  } else if (access.state === "deleted") {
    const reason = "The report file was deleted (data retention), so it cannot be delivered again.";
    resend = off(reason);
    extend = off(reason);
  } else {
    extend = on;
    resend = access.state === "expired" ? off("Access has expired: extend it first.") : on;
  }
  return { retry, resend, extend };
}

function statusLabel(status: OrderStatus): string {
  return status === "awaiting_payment" ? "awaiting payment" : humanize(status).toLowerCase();
}

/** Validate the "extend access" hours input: whole number 1…168. */
export function parseExtendHours(raw: string): { hours: number } | { error: string } {
  const text = raw.trim();
  if (!/^\d+$/.test(text))
    return { error: `Enter a whole number of hours (1–${MAX_EXTEND_HOURS}).` };
  const hours = Number(text);
  if (hours < 1 || hours > MAX_EXTEND_HOURS) {
    return { error: `Enter between 1 and ${MAX_EXTEND_HOURS} hours (7 days).` };
  }
  return { hours };
}

/** New expiry as the backend computes it: `max(expires_at, now) + hours`. */
export function extendedExpiry(expiresAt: string, hours: number, now: number = Date.now()): Date {
  const base = Math.max(Date.parse(expiresAt) || now, now);
  return new Date(base + hours * 3_600_000);
}

/** "1 day 6 hours" style label for an hours amount (extend presets). */
export function hoursLabel(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return formatDuration(hours * 3600);
}

/** Friendlier text for the order actions' 409s (the backend message is more specific for some). */
export function orderActionErrorMessage(err: unknown): string {
  const error = toAdminApiError(err);
  switch (error.code) {
    case "order_not_retryable":
      return "This order can't be regenerated in its current status. Only failed orders, or paid orders whose generation got stuck, can be retried.";
    case "generation_in_progress":
      return "A generation job for this order is already queued or running. Wait for it to finish; the page updates by itself.";
    case "report_not_available":
      if (/expired/i.test(error.message)) {
        return "Access to this report has expired. Extend access first, then resend the email.";
      }
      if (/no longer exists/i.test(error.message)) {
        return "The report file no longer exists on the server, so it cannot be delivered again.";
      }
      return "There is no report to deliver for this order (it isn't ready or was deleted).";
    case "job_not_failed":
      return "This job is no longer failed (it may have been retried already). The list has been refreshed.";
    default:
      return adminErrorMessage(error);
  }
}
