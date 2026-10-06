import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { downloadProblem, mapFreeReadingError, mapOrderError, retryAfterMinutes } from "./errors";

const bounds = { min: "1900-01-01", max: "2026-10-06" };

const validation = (...fields: string[]) =>
  new ApiError(422, "validation_error", "Invalid input", {
    fields: fields.map((field) => ({ field, message: "English text", type: "value_error" })),
  });

describe("mapOrderError", () => {
  it("asks which time is meant for an ambiguous local time", () => {
    const options = [
      { fold: 0, utc_offset_minutes: 180, label: "01:30 (UTC+03:00)" },
      { fold: 1, utc_offset_minutes: 120, label: "01:30 (UTC+02:00)" },
    ];
    expect(
      mapOrderError(new ApiError(422, "ambiguous_local_time", "", { options }), bounds),
    ).toEqual({ kind: "ambiguousTime", options });
  });

  it("falls back to a form error when the ambiguous options are missing", () => {
    expect(mapOrderError(new ApiError(422, "ambiguous_local_time"), bounds).kind).toBe("form");
  });

  it("offers the suggested time for a nonexistent local time", () => {
    expect(
      mapOrderError(
        new ApiError(422, "nonexistent_local_time", "", {
          suggested_time: "03:30",
          suggested_date: "2021-03-28",
        }),
        bounds,
      ),
    ).toEqual({ kind: "nonexistentTime", suggestedTime: "03:30" });
    expect(mapOrderError(new ApiError(422, "nonexistent_local_time"), bounds)).toEqual({
      kind: "nonexistentTime",
      suggestedTime: null,
    });
  });

  it.each(["not_found", "inactive", "not_started", "expired", "exhausted", "currency_mismatch"])(
    "keeps the discount reason %s",
    (reason) => {
      expect(
        mapOrderError(new ApiError(422, "invalid_discount_code", "", { reason }), bounds),
      ).toEqual({ kind: "discount", reason });
    },
  );

  it("tolerates an unknown discount reason", () => {
    expect(
      mapOrderError(new ApiError(422, "invalid_discount_code", "", { reason: "weird" }), bounds),
    ).toEqual({ kind: "discount", reason: null });
  });

  it("maps validation errors to localized field issues", () => {
    expect(
      mapOrderError(validation("email", "birth_time", "city_id", "display_name"), bounds),
    ).toEqual({
      kind: "fields",
      issues: {
        email: { key: "email" },
        birthTime: { key: "time" },
        city: { key: "city" },
        displayName: { key: "tooLong", values: { max: 80 } },
      },
    });
  });

  it("maps the date range error with the API's bounds", () => {
    expect(
      mapOrderError(
        new ApiError(422, "birth_date_out_of_range", "", {
          earliest: "1900-01-01",
          latest: "2026-10-05",
        }),
        bounds,
      ),
    ).toEqual({
      kind: "fields",
      issues: { birthDate: { key: "dateRange", values: { min: "1900-01-01", max: "2026-10-05" } } },
    });
  });

  it("maps terms, unknown city and unusable places", () => {
    expect(mapOrderError(new ApiError(422, "terms_not_accepted"), bounds)).toEqual({
      kind: "fields",
      issues: { acceptTerms: { key: "terms" } },
    });
    expect(mapOrderError(new ApiError(404, "not_found"), bounds)).toEqual({
      kind: "fields",
      issues: { city: { key: "city" } },
    });
    expect(mapOrderError(new ApiError(422, "invalid_place"), bounds)).toEqual({
      kind: "invalidPlace",
    });
  });

  it("leaves rate limits, network and server problems to the form alert", () => {
    for (const err of [
      new ApiError(429, "rate_limited", "", {}, 120),
      ApiError.network(),
      new ApiError(503, "payment_unavailable"),
      validation("locale"),
      new Error("boom"),
    ]) {
      expect(mapOrderError(err, bounds)).toEqual({ kind: "form", error: err });
    }
  });
});

describe("mapFreeReadingError", () => {
  it("maps field errors and keeps the rest for the alert", () => {
    expect(mapFreeReadingError(validation("birth_date", "email"), bounds)).toEqual({
      kind: "fields",
      issues: { birthDate: { key: "date" }, email: { key: "email" } },
    });
    expect(mapFreeReadingError(new ApiError(422, "birth_date_out_of_range"), bounds)).toEqual({
      kind: "fields",
      issues: { birthDate: { key: "dateRange", values: bounds } },
    });
    const limited = new ApiError(429, "rate_limited", "", {}, 30);
    expect(mapFreeReadingError(limited, bounds)).toEqual({ kind: "form", error: limited });
  });
});

describe("downloadProblem", () => {
  it("distinguishes invalid, not ready and expired links", () => {
    expect(downloadProblem(new ApiError(404, "not_found"))).toBe("invalidLink");
    expect(downloadProblem(new ApiError(409, "report_not_ready"))).toBe("notReady");
    expect(downloadProblem(new ApiError(410, "report_expired"))).toBe("expired");
    expect(downloadProblem(new ApiError(429, "rate_limited"))).toBe("rateLimited");
    expect(downloadProblem(ApiError.network())).toBe("failed");
    expect(downloadProblem(new TypeError("x"))).toBe("failed");
  });
});

describe("retryAfterMinutes", () => {
  it("rounds Retry-After up to whole minutes", () => {
    expect(retryAfterMinutes(new ApiError(429, "rate_limited", "", {}, 61))).toBe(2);
    expect(retryAfterMinutes(new ApiError(429, "rate_limited", "", {}, 5))).toBe(1);
    expect(retryAfterMinutes(new ApiError(429, "rate_limited"))).toBeNull();
    expect(retryAfterMinutes(ApiError.network())).toBeNull();
  });
});
