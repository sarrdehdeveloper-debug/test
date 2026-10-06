import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "./format";

describe("formatMoney", () => {
  it("formats minor units, hiding zero cents", () => {
    expect(formatMoney(2900, "USD", "en")).toBe("$29");
    expect(formatMoney(2610, "USD", "en")).toBe("$26.10");
  });

  it("uses Latin digits in Arabic", () => {
    const value = formatMoney(2900, "USD", "ar");
    expect(value).toContain("29");
    expect(value).toMatch(/US\$|\$/);
  });

  it("falls back for unknown currencies", () => {
    expect(formatMoney(1234, "NOT-A-CURRENCY", "en")).toBe("12.34 NOT-A-CURRENCY");
  });
});

describe("formatDate", () => {
  it("formats ISO dates in UTC", () => {
    expect(formatDate("2026-10-05", "en")).toBe("October 5, 2026");
    expect(formatDate("2026-10-05T23:30:00Z", "en", { dateStyle: "medium" })).toBe("Oct 5, 2026");
  });

  it("returns an empty string for missing or invalid values", () => {
    expect(formatDate(null, "en")).toBe("");
    expect(formatDate("not a date", "en")).toBe("");
  });

  it("uses Latin digits in Arabic", () => {
    expect(formatDate("2026-10-05", "ar")).toMatch(/5 .+ 2026/);
  });
});
