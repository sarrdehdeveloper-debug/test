import { afterEach, describe, expect, it } from "vitest";
import {
  formatTotpSecret,
  mfaFlowReducer,
  passwordStrength,
  validatePasswordChange,
  type MfaFlowState,
} from "./account";
import { AdminApiError } from "./api";
import { adminErrorMessage, adminFieldErrors, humanizeField } from "./errors";
import { pageBounds, paginationRange, parsePage, totalPages } from "./pagination";
import { clearToasts, dismissToast, getToasts, toast } from "./toast";
import { normalizeTotpInput } from "./totp";
import {
  compactTranslations,
  isRtlLocale,
  localeDir,
  localeLabel,
  missingFields,
  setTranslationField,
  translationStatus,
} from "./translations";
import type { OfferTranslation, Translations } from "./types";
import { validateImageFile, validateImageUrl } from "./upload";

describe("pagination", () => {
  it("computes pages and bounds", () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(132, 20)).toBe(7);
    expect(pageBounds(2, 20, 132)).toEqual([21, 40]);
    expect(pageBounds(7, 20, 132)).toEqual([121, 132]);
    expect(pageBounds(1, 20, 0)).toEqual([0, 0]);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage(null)).toBe(1);
  });

  it("builds a compact page range", () => {
    expect(paginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(6, 12)).toEqual([1, "…", 5, 6, 7, "…", 12]);
    expect(paginationRange(1, 12)).toEqual([1, 2, "…", 12]);
    expect(paginationRange(3, 12)).toEqual([1, 2, 3, 4, "…", 12]);
    expect(paginationRange(12, 12)).toEqual([1, "…", 11, 12]);
    expect(paginationRange(4, 8)).toEqual([1, 2, 3, 4, 5, "…", 8]);
    expect(paginationRange(99, 8)).toEqual([1, "…", 7, 8]);
    expect(paginationRange(1, 0)).toEqual([]);
  });
});

describe("translations", () => {
  const fields = ["title", "subtitle", "body", "cta_label"] as const;
  const value: Translations<Partial<OfferTranslation>> = {
    en: { title: "Spring", subtitle: "Sale", body: "Text", cta_label: "Go" },
    ar: { title: "ربيع", subtitle: "  ", body: "" },
  };

  it("reports completeness per locale", () => {
    expect(translationStatus(value, "en", fields)).toBe("complete");
    expect(translationStatus(value, "ar", fields)).toBe("partial");
    expect(translationStatus(value, "fr", fields)).toBe("empty");
    expect(translationStatus(null, "en", fields)).toBe("empty");
    expect(missingFields(value, "ar", fields)).toEqual(["subtitle", "body", "cta_label"]);
  });

  it("updates immutably and compacts blank locales", () => {
    const next = setTranslationField(value, "ar", "cta_label", "اطلب");
    expect(next.ar?.cta_label).toBe("اطلب");
    expect(value.ar?.cta_label).toBeUndefined();
    expect(next.en).toBe(value.en);
    expect(setTranslationField<{ title: string }, "title">(undefined, "en", "title", "x")).toEqual({
      en: { title: "x" },
    });
    expect(compactTranslations({ en: { title: "A" }, ar: { title: " ", body: "" } })).toEqual({
      en: { title: "A" },
    });
  });

  it("knows RTL locales and labels", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("ar-EG")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
    expect(localeDir("ar")).toBe("rtl");
    expect(localeLabel("ar")).toBe("Arabic");
    expect(localeLabel("fr")).toBe("FR");
  });
});

describe("account helpers", () => {
  it("validates a password change like the backend", () => {
    expect(validatePasswordChange({ current: "", next: "", confirm: "" })).toEqual({
      current: "Enter your current password.",
      next: "Enter a new password.",
    });
    expect(
      validatePasswordChange({ current: "old", next: "short", confirm: "short" }).next,
    ).toMatch(/12 characters/);
    expect(
      validatePasswordChange({
        current: "Same-Password-1",
        next: "Same-Password-1",
        confirm: "Same-Password-1",
      }).next,
    ).toMatch(/differ/);
    expect(
      validatePasswordChange({
        current: "old",
        next: "A-long-new-pass",
        confirm: "A-long-new-pas",
      }),
    ).toEqual({ confirm: "The passwords do not match." });
    expect(
      validatePasswordChange({
        current: "old",
        next: "A-long-new-pass",
        confirm: "A-long-new-pass",
      }),
    ).toEqual({});
    expect(
      validatePasswordChange({ current: "old", next: "x".repeat(201), confirm: "" }).next,
    ).toMatch(/200/);
  });

  it("rates password strength", () => {
    expect(passwordStrength("")).toEqual({ score: 0, label: "" });
    expect(passwordStrength("abc").label).toBe("9 more characters needed");
    expect(passwordStrength("abcdefghijkl").score).toBe(1);
    expect(passwordStrength("abcdefghijk1").score).toBe(2);
    expect(passwordStrength("Abcdefghijk1!x").score).toBe(3);
    expect(passwordStrength("correct horse battery staple").score).toBe(3);
  });

  it("formats TOTP secrets and normalises codes", () => {
    expect(formatTotpSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(formatTotpSecret("ABCDE")).toBe("ABCD E");
    expect(normalizeTotpInput("123 456")).toBe("123456");
    expect(normalizeTotpInput("12-34-56-78")).toBe("123456");
    expect(normalizeTotpInput("١٢٣٤٥٦")).toBe("123456");
    expect(normalizeTotpInput("۱۲۳abc")).toBe("123");
  });

  it("runs the two-factor flow state machine", () => {
    let state: MfaFlowState = { step: "idle" };
    state = mfaFlowReducer(state, { type: "setupStarted", secret: "S", otpauthUrl: "otpauth://x" });
    expect(state).toEqual({ step: "setup", secret: "S", otpauthUrl: "otpauth://x" });
    // Restarting the setup replaces the secret.
    state = mfaFlowReducer(state, { type: "setupStarted", secret: "T", otpauthUrl: "otpauth://y" });
    expect(state).toMatchObject({ secret: "T" });
    expect(mfaFlowReducer(state, { type: "openDisable" })).toBe(state);
    state = mfaFlowReducer(state, { type: "completed" });
    expect(state).toEqual({ step: "idle" });
    state = mfaFlowReducer(state, { type: "openDisable" });
    expect(state).toEqual({ step: "disable" });
    expect(mfaFlowReducer(state, { type: "setupStarted", secret: "S", otpauthUrl: "u" })).toBe(
      state,
    );
    expect(mfaFlowReducer(state, { type: "cancel" })).toEqual({ step: "idle" });
  });
});

describe("error messages", () => {
  it("maps known codes and falls back to the API message", () => {
    expect(adminErrorMessage(new AdminApiError(401, "invalid_credentials"))).toBe(
      "Incorrect email or password.",
    );
    expect(adminErrorMessage(new AdminApiError(409, "slug_taken"))).toMatch(/slug/);
    expect(adminErrorMessage(new AdminApiError(0, "network"))).toMatch(/reach the server/);
    expect(
      adminErrorMessage(new AdminApiError(422, "invalid_setting", "Invalid value for min_words")),
    ).toBe("Invalid value for min_words");
    expect(adminErrorMessage(new AdminApiError(418, "teapot", "I'm a teapot"))).toBe(
      "I'm a teapot",
    );
    expect(adminErrorMessage(new Error("boom"))).toBe("boom");
    expect(adminErrorMessage(new DOMException("x", "AbortError"), { allowAbort: true })).toBeNull();
  });

  it("explains rate limits with the wait time", () => {
    const err = new AdminApiError(429, "rate_limited", "Too many", { retry_after_seconds: 840 });
    expect(adminErrorMessage(err)).toBe("Too many attempts. Try again in 14 minutes.");
    expect(adminErrorMessage(new AdminApiError(429, "rate_limited"))).toMatch(/wait a moment/);
  });

  it("shows a single validation error with its field", () => {
    const one = new AdminApiError(422, "validation_error", "Invalid input", {
      fields: [
        {
          field: "translations",
          message: "Value error, Translation 'ar' needs a title",
          type: "value_error",
        },
      ],
    });
    expect(adminErrorMessage(one)).toBe("Translations: Translation 'ar' needs a title");
    expect(adminFieldErrors(one)).toEqual({ translations: "Translation 'ar' needs a title" });
    const many = new AdminApiError(422, "validation_error", "Invalid input", {
      fields: [
        { field: "slug", message: "bad", type: "x" },
        { field: "code", message: "bad", type: "x" },
      ],
    });
    expect(adminErrorMessage(many)).toMatch(/highlighted fields/);
    expect(humanizeField("translations.ar.title")).toBe("Translations › ar › title");
    expect(humanizeField("current_password")).toBe("Current password");
    expect(
      adminErrorMessage(new AdminApiError(413, "file_too_large", "x", { max_bytes: 5242880 })),
    ).toBe("The file is too large (maximum 5 MB).");
  });
});

describe("upload validation", () => {
  it("checks type and size of images", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "image/svg+xml", size: 1000 })).toMatch(/JPEG, PNG/);
    expect(validateImageFile({ type: "image/jpeg", size: 0 })).toMatch(/empty/);
    expect(validateImageFile({ type: "image/webp", size: 6 * 1024 * 1024 })).toBe(
      "The file is 6 MB; the maximum is 5 MB.",
    );
  });

  it("accepts the URLs the API accepts", () => {
    expect(validateImageUrl("/api/v1/media/abc.webp")).toBeNull();
    expect(validateImageUrl("https://cdn.example.com/a.png")).toBeNull();
    expect(validateImageUrl("")).toMatch(/Enter/);
    expect(validateImageUrl("//evil.example/a.png")).toMatch(/site path/);
    expect(validateImageUrl("javascript:alert(1)")).toMatch(/site path/);
    expect(validateImageUrl("data:image/png;base64,xx")).toMatch(/site path/);
    expect(validateImageUrl("/a b.png")).toMatch(/spaces/);
    expect(validateImageUrl("/\\evil")).toMatch(/backslashes/);
    expect(validateImageUrl(`https://x.example/${"a".repeat(500)}`)).toMatch(/too long/);
  });
});

describe("toast store", () => {
  afterEach(clearToasts);

  it("queues, de-duplicates, caps and dismisses toasts", () => {
    const id = toast.success("Saved");
    toast.success("Saved");
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0].duration).toBe(5000);
    toast.error("Failed");
    expect(getToasts()[1]).toMatchObject({ tone: "error", duration: 8000 });
    toast.info("a");
    toast.info("b");
    toast.info("c");
    expect(getToasts()).toHaveLength(4);
    expect(getToasts().map((t) => t.title)).toEqual(["Failed", "a", "b", "c"]);
    dismissToast(id);
    const before = getToasts();
    dismissToast(9999);
    expect(getToasts()).toBe(before);
  });
});
