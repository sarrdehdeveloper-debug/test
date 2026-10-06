import { describe, expect, it } from "vitest";
import {
  cleanDisplayName,
  firstIssueField,
  isIsoDate,
  isValidEmail,
  localToday,
  normalizeDiscountCode,
  normalizeTime,
  validateBirthDate,
  validateFreeForm,
  validateOrderForm,
  type OrderFormValues,
} from "./validation";

const bounds = { min: "1900-01-01", max: "2026-10-06" };

const validOrder: OrderFormValues = {
  displayName: "Layla",
  email: "layla@example.com",
  emailConfirm: "Layla@Example.com ",
  birthDate: "1990-08-17",
  birthTime: "14:30",
  country: "EG",
  cityId: 360630,
  discountCode: "",
  acceptTerms: true,
};

describe("isIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isIsoDate("1990-08-17")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate("1990-13-01")).toBe(false);
    expect(isIsoDate("1990-8-17")).toBe(false);
    // Arabic-Indic digits are rejected, like the backend's ASCII-only pattern.
    expect(isIsoDate("١٩٩٠-٠٨-١٧")).toBe(false);
  });
});

describe("validateBirthDate", () => {
  it("requires a value in range", () => {
    expect(validateBirthDate("", bounds.min, bounds.max)).toEqual({ key: "required" });
    expect(validateBirthDate("1990-02-30", bounds.min, bounds.max)).toEqual({ key: "date" });
    expect(validateBirthDate("1899-12-31", bounds.min, bounds.max)).toEqual({
      key: "dateRange",
      values: bounds,
    });
    expect(validateBirthDate("2026-10-07", bounds.min, bounds.max)?.key).toBe("dateRange");
    expect(validateBirthDate("1900-01-01", bounds.min, bounds.max)).toBeNull();
    expect(validateBirthDate("2026-10-06", bounds.min, bounds.max)).toBeNull();
  });
});

describe("normalizeTime", () => {
  it("returns HH:MM for valid input", () => {
    expect(normalizeTime("14:30")).toBe("14:30");
    expect(normalizeTime("00:00")).toBe("00:00");
    expect(normalizeTime("23:59:30")).toBe("23:59");
    expect(normalizeTime("24:00")).toBe("");
    expect(normalizeTime("7:05")).toBe("");
    expect(normalizeTime("")).toBe("");
  });
});

describe("isValidEmail", () => {
  it.each([
    ["a@example.com", true],
    ["first.last+tag@sub.example.co", true],
    ["  padded@example.com  ", true],
    ["user@مثال.مصر", true],
    ["no-at.example.com", false],
    ["two@@example.com", false],
    ["a@b", false],
    ["a@b.c", false],
    ["a@example.123", false],
    [".a@example.com", false],
    ["a..b@example.com", false],
    ["a@-example.com", false],
    ["a b@example.com", false],
    [`${"x".repeat(250)}@example.com`, false],
  ])("%s -> %s", (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe("cleanDisplayName", () => {
  it("collapses whitespace and drops control / bidi override characters", () => {
    expect(cleanDisplayName("  Layla \n  Hassan ")).toBe("Layla Hassan");
    expect(cleanDisplayName("A‮B\u0007C")).toBe("ABC");
  });
});

describe("validateFreeForm", () => {
  it("validates date, email and language", () => {
    expect(
      validateFreeForm(
        { birthDate: "1990-08-17", email: "a@example.com", language: "ar" },
        bounds,
        ["en", "ar"],
      ),
    ).toEqual({});
    expect(
      validateFreeForm({ birthDate: "", email: "nope", language: "fr" }, bounds, ["en", "ar"]),
    ).toEqual({
      birthDate: { key: "required" },
      email: { key: "email" },
      language: { key: "required" },
    });
  });
});

describe("validateOrderForm", () => {
  it("accepts a complete form (email confirmation is case-insensitive)", () => {
    expect(validateOrderForm(validOrder, bounds)).toEqual({});
  });

  it("reports every problem with its message key", () => {
    const issues = validateOrderForm(
      {
        displayName: "x".repeat(81),
        email: "a@example.com",
        emailConfirm: "b@example.com",
        birthDate: "2100-01-01",
        birthTime: "",
        country: "",
        cityId: null,
        discountCode: "X".repeat(65),
        acceptTerms: false,
      },
      bounds,
    );
    expect(issues).toEqual({
      displayName: { key: "tooLong", values: { max: 80 } },
      emailConfirm: { key: "emailMismatch" },
      birthDate: { key: "dateRange", values: bounds },
      birthTime: { key: "required" },
      country: { key: "country" },
      discountCode: { key: "tooLong", values: { max: 64 } },
      acceptTerms: { key: "terms" },
    });
  });

  it("asks for a city once a country is chosen", () => {
    expect(validateOrderForm({ ...validOrder, cityId: null }, bounds)).toEqual({
      city: { key: "city" },
    });
  });

  it("counts the name in code points, after cleaning", () => {
    const eighty = "😀".repeat(80);
    expect(validateOrderForm({ ...validOrder, displayName: `  ${eighty}  ` }, bounds)).toEqual({});
  });

  it("does not report a mismatch while the email itself is invalid", () => {
    expect(
      validateOrderForm({ ...validOrder, email: "bad", emailConfirm: "other" }, bounds),
    ).toEqual({ email: { key: "email" } });
  });
});

describe("helpers", () => {
  it("normalises discount codes like the backend", () => {
    expect(normalizeDiscountCode("  save10 ")).toBe("SAVE10");
    expect(normalizeDiscountCode("   ")).toBeNull();
  });

  it("finds the first field with an issue in form order", () => {
    expect(
      firstIssueField({ city: { key: "city" }, email: { key: "email" } }, [
        "email",
        "city",
      ] as const),
    ).toBe("email");
    expect(firstIssueField({}, ["email"] as const)).toBeNull();
  });

  it("formats the local date", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
