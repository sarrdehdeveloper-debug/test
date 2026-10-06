import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  centsToInput,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatRelative,
  formatTime,
  humanize,
  initials,
  isoToLocalInput,
  localInputToIso,
  parseMoneyInput,
  shortId,
} from "./format";

describe("money", () => {
  it("formats cents with two decimals", () => {
    expect(formatMoney(2900, "USD")).toBe("$29.00");
    expect(formatMoney(261000, "USD")).toBe("$2,610.00");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(150, "US")).toBe("1.50 US"); // invalid code → plain fallback
  });

  it("round-trips input values", () => {
    expect(centsToInput(2950)).toBe("29.50");
    expect(centsToInput(5)).toBe("0.05");
    expect(centsToInput(null)).toBe("");
    expect(parseMoneyInput("29.5")).toBe(2950);
    expect(parseMoneyInput("1,234.56")).toBe(123456);
    expect(parseMoneyInput(".5")).toBe(50);
    expect(parseMoneyInput("29.")).toBe(2900);
    expect(parseMoneyInput("  ")).toBeNull();
    expect(parseMoneyInput("abc")).toBeUndefined();
    expect(parseMoneyInput("1.234")).toBeUndefined();
    expect(parseMoneyInput("-5")).toBeUndefined();
    expect(parseMoneyInput("-5", { allowNegative: true })).toBe(-500);
    expect(parseMoneyInput(".")).toBeUndefined();
  });
});

describe("numbers, bytes, labels", () => {
  it("formats", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(-1)).toBe("—");
    expect(humanize("generation_failed")).toBe("Generation failed");
    expect(humanize("send-report-email")).toBe("Send report email");
    expect(shortId("a60d2ed1-8394-4442-a51e-520e78da507d")).toBe("a60d2ed1");
    expect(initials("Dev Owner")).toBe("DO");
    expect(initials("editor@zodiacblend.test")).toBe("E");
    expect(initials("Anna Maria Lopez")).toBe("AL");
    expect(initials("")).toBe("?");
  });

  it("formats durations for rate limits", () => {
    expect(formatDuration(1)).toBe("1 second");
    expect(formatDuration(45)).toBe("45 seconds");
    expect(formatDuration(61)).toBe("2 minutes");
    expect(formatDuration(60)).toBe("1 minute");
    expect(formatDuration(900)).toBe("15 minutes");
    expect(formatDuration(3720)).toBe("1 hour 2 minutes");
    expect(formatDuration(7200)).toBe("2 hours");
  });
});

describe("dates", () => {
  it("formats in a given time zone", () => {
    expect(formatDateTime("2026-10-06T12:05:00Z", { timeZone: "UTC" })).toBe("6 Oct 2026, 12:05");
    expect(formatDateTime("2026-10-06T12:05:09Z", { timeZone: "UTC", seconds: true })).toBe(
      "6 Oct 2026, 12:05:09",
    );
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
    expect(formatDate("2026-10-06T23:30:00Z", { timeZone: "UTC" })).toBe("6 Oct 2026");
    // Plain dates never shift with the browser's time zone.
    expect(formatDate("1990-08-17")).toBe("17 Aug 1990");
    expect(formatTime("2026-10-06T08:05:00Z").length).toBe(5);
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-10-06T12:00:00Z");
    expect(formatRelative("2026-10-06T11:59:40Z", now)).toBe("just now");
    expect(formatRelative("2026-10-06T11:55:00Z", now)).toBe("5 min ago");
    expect(formatRelative("2026-10-06T09:00:00Z", now)).toBe("3 h ago");
    expect(formatRelative("2026-10-05T12:00:00Z", now)).toBe("1 day ago");
    expect(formatRelative("2026-10-06T16:00:00Z", now)).toBe("in 4 h");
    expect(formatRelative("2026-08-01T12:00:00Z", now)).toMatch(/2026/);
  });
});

describe("datetime-local conversion", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "Europe/Berlin";
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("converts ISO UTC to the local input value and back", () => {
    const local = isoToLocalInput("2026-10-06T12:05:00Z");
    expect(local).toMatch(/^2026-10-06T\d{2}:05$/);
    expect(localInputToIso(local)).toBe("2026-10-06T12:05:00.000Z");
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput("garbage")).toBe("");
  });

  it("tells empty from invalid input", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("2026-13-40T10:00")).toBeUndefined();
    expect(localInputToIso("2026-02-30T10:00")).toBeUndefined();
    expect(localInputToIso("yesterday")).toBeUndefined();
    expect(localInputToIso("2026-10-06T10:00:30")).toMatch(/:30\.000Z$/);
  });
});
