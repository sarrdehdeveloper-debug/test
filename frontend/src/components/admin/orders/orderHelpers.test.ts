import { describe, expect, it } from "vitest";
import { AdminApiError } from "@/lib/admin/api";
import type { AdminJob, AdminReport } from "@/lib/admin/types";
import {
  extendedExpiry,
  hoursLabel,
  orderActionErrorMessage,
  orderActions,
  parseExtendHours,
  reportAccess,
  shouldPollOrder,
} from "./orderHelpers";

const NOW = Date.parse("2026-10-06T12:00:00Z");

const report = (overrides: Partial<AdminReport> = {}): AdminReport => ({
  created_at: "2026-10-06T10:00:00Z",
  expires_at: "2026-10-07T10:00:00Z",
  email_sent_at: "2026-10-06T10:00:05Z",
  download_count: 1,
  last_download_at: null,
  deleted_at: null,
  size_bytes: 700_000,
  ...overrides,
});

const job = (overrides: Partial<AdminJob> = {}): AdminJob => ({
  id: 1,
  kind: "generate_report",
  status: "done",
  attempts: 1,
  max_attempts: 5,
  run_at: "2026-10-06T10:00:00Z",
  created_at: "2026-10-06T10:00:00Z",
  finished_at: null,
  last_error: null,
  dedupe_key: null,
  order_id: "x",
  ...overrides,
});

const base = { report: null, jobs: [] as AdminJob[], personal_data_purged_at: null };

describe("orderActions", () => {
  it("allows retry for failed orders without an active job", () => {
    expect(orderActions({ ...base, status: "generation_failed" }, NOW).retry).toEqual({
      enabled: true,
      reason: null,
    });
    const running = orderActions(
      { ...base, status: "generation_failed", jobs: [job({ status: "pending" })] },
      NOW,
    );
    expect(running.retry.enabled).toBe(false);
  });

  it("allows retry for stuck paid orders only", () => {
    expect(orderActions({ ...base, status: "generating" }, NOW).retry.enabled).toBe(true);
    const busy = orderActions(
      { ...base, status: "generating", jobs: [job({ status: "running" })] },
      NOW,
    );
    expect(busy.retry.enabled).toBe(false);
    expect(busy.retry.reason).toMatch(/running/);
    // An active email job does not block regeneration.
    const email = orderActions(
      { ...base, status: "queued", jobs: [job({ kind: "send_report_email", status: "pending" })] },
      NOW,
    );
    expect(email.retry.enabled).toBe(true);
  });

  it("explains why unpaid or ready orders cannot be retried", () => {
    expect(orderActions({ ...base, status: "awaiting_payment" }, NOW).retry.reason).toBe(
      "Only paid orders can be generated (this one is awaiting payment).",
    );
    expect(orderActions({ ...base, status: "ready", report: report() }, NOW).retry.enabled).toBe(
      false,
    );
  });

  it("allows resend and extend for a ready report with access", () => {
    const actions = orderActions({ ...base, status: "ready", report: report() }, NOW);
    expect(actions.resend.enabled).toBe(true);
    expect(actions.extend.enabled).toBe(true);
  });

  it("asks to extend first when access expired", () => {
    const actions = orderActions(
      { ...base, status: "ready", report: report({ expires_at: "2026-10-06T11:00:00Z" }) },
      NOW,
    );
    expect(actions.resend).toEqual({
      enabled: false,
      reason: "Access has expired: extend it first.",
    });
    expect(actions.extend.enabled).toBe(true);
  });

  it("blocks delivery when the file was deleted or the order is not ready", () => {
    const deleted = orderActions(
      { ...base, status: "ready", report: report({ deleted_at: "2026-10-06T11:00:00Z" }) },
      NOW,
    );
    expect(deleted.resend.enabled || deleted.extend.enabled).toBe(false);
    const pending = orderActions({ ...base, status: "generating" }, NOW);
    expect(pending.resend.reason).toBe("The report isn't ready yet.");
  });
});

describe("reportAccess", () => {
  it("reports none, deleted, expired and active", () => {
    expect(reportAccess(null, NOW)).toEqual({ state: "none" });
    expect(reportAccess(report({ deleted_at: "2026-10-06T11:00:00Z" }), NOW).state).toBe("deleted");
    expect(reportAccess(report({ expires_at: "2026-10-06T12:00:00Z" }), NOW).state).toBe("expired");
    expect(reportAccess(report(), NOW)).toEqual({
      state: "active",
      until: "2026-10-07T10:00:00Z",
      remainingSeconds: 22 * 3600,
    });
  });
});

describe("shouldPollOrder", () => {
  it("polls while generating or while a job is queued", () => {
    expect(shouldPollOrder(undefined)).toBe(false);
    expect(shouldPollOrder({ status: "queued", jobs: [] })).toBe(true);
    expect(shouldPollOrder({ status: "ready", jobs: [job()] })).toBe(false);
    expect(
      shouldPollOrder({
        status: "ready",
        jobs: [job({ kind: "send_report_email", status: "pending" })],
      }),
    ).toBe(true);
  });
});

describe("extend access", () => {
  it("parses hours 1..168", () => {
    expect(parseExtendHours("24")).toEqual({ hours: 24 });
    expect(parseExtendHours(" 168 ")).toEqual({ hours: 168 });
    expect(parseExtendHours("0")).toHaveProperty("error");
    expect(parseExtendHours("169")).toHaveProperty("error");
    expect(parseExtendHours("1.5")).toHaveProperty("error");
    expect(parseExtendHours("")).toHaveProperty("error");
  });

  it("computes the new expiry from the later of expiry and now", () => {
    expect(extendedExpiry("2026-10-07T10:00:00Z", 24, NOW).toISOString()).toBe(
      "2026-10-08T10:00:00.000Z",
    );
    expect(extendedExpiry("2026-10-01T10:00:00Z", 2, NOW).toISOString()).toBe(
      "2026-10-06T14:00:00.000Z",
    );
  });

  it("labels presets", () => {
    expect(hoursLabel(24)).toBe("1 day");
    expect(hoursLabel(168)).toBe("7 days");
    expect(hoursLabel(12)).toBe("12 hours");
  });
});

describe("orderActionErrorMessage", () => {
  it("explains the 409s", () => {
    const expired = new AdminApiError(
      409,
      "report_not_available",
      "The report access has expired; extend it first",
    );
    expect(orderActionErrorMessage(expired)).toMatch(/Extend access first/);
    expect(orderActionErrorMessage(new AdminApiError(409, "generation_in_progress", "x"))).toMatch(
      /already queued or running/,
    );
    expect(orderActionErrorMessage(new AdminApiError(409, "order_not_retryable", "x"))).toMatch(
      /can't be regenerated/,
    );
    expect(orderActionErrorMessage(new AdminApiError(0, "network", "x"))).toMatch(
      /Cannot reach the server/,
    );
  });
});
