import { describe, expect, it } from "vitest";
import type { Discount, OfferAdmin } from "@/lib/admin/types";
import {
  discountOptionLabel,
  discountPatch,
  discountPayload,
  discountState,
  discountToForm,
  discountUsage,
  discountValueLabel,
  normalizeCode,
  validateDiscount,
} from "./discountForm";
import {
  offerPatch,
  offerPayload,
  offerStatus,
  offerTitle,
  offerToForm,
  validateOffer,
} from "./offerForm";

const OFFER: OfferAdmin = {
  id: 1,
  slug: "launch",
  translations: {
    en: { title: "Launch offer", subtitle: "Sub", body: "Body", cta_label: "Get it" },
    ar: { title: "عرض الإطلاق", subtitle: "", body: "", cta_label: "" },
  },
  image_url: null,
  cta_url: "/reading",
  discount_code_id: 1,
  discount_code: "WELCOME10",
  show_banner: true,
  is_active: true,
  starts_at: null,
  ends_at: null,
  sort_order: 0,
  is_live: true,
  created_at: "2026-10-06T12:00:00Z",
  updated_at: "2026-10-06T12:00:00Z",
};

const NOW = Date.parse("2026-10-06T12:00:00Z");

describe("offer form", () => {
  it("maps a row to form values and back without changes", () => {
    const form = offerToForm(OFFER, ["en", "ar"]);
    expect(form.sort_order).toBe("0");
    expect(form.translations.ar).toEqual({
      title: "عرض الإطلاق",
      subtitle: "",
      body: "",
      cta_label: "",
    });
    expect(offerPatch(form, form)).toEqual({});
    expect(offerPayload(form)).toMatchObject({
      slug: "launch",
      cta_url: "/reading",
      discount_code_id: 1,
      sort_order: 0,
    });
  });

  it("uses safe defaults for a new offer", () => {
    const form = offerToForm(null, ["en", "ar"]);
    expect(form).toMatchObject({ is_active: true, show_banner: false, cta_url: "", slug: "" });
    expect(offerPayload(form).translations).toEqual({});
  });

  it("sends only changed fields, with emptied values as null", () => {
    const initial = offerToForm(OFFER, ["en", "ar"]);
    const edited = {
      ...initial,
      cta_url: "  ",
      sort_order: "5",
      translations: {
        ...initial.translations,
        ar: { title: "", subtitle: "", body: "", cta_label: "" },
      },
    };
    expect(offerPatch(initial, edited)).toEqual({
      cta_url: null,
      sort_order: 5,
      translations: {
        en: { title: "Launch offer", subtitle: "Sub", body: "Body", cta_label: "Get it" },
      },
    });
  });

  it("validates like the API", () => {
    const form = offerToForm(null, ["en", "ar"]);
    const errors = validateOffer(
      {
        ...form,
        slug: "Bad slug",
        cta_url: "javascript:alert(1)",
        starts_at: "2026-10-10T00:00:00Z",
        ends_at: "2026-10-01T00:00:00Z",
        sort_order: "x",
      },
      "en",
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["cta_url", "ends_at", "slug", "sort_order", "translations.en.title"].sort(),
    );
    expect(validateOffer(offerToForm(OFFER, ["en", "ar"]), "en")).toEqual({});
  });

  it("derives the visibility status", () => {
    expect(offerStatus(OFFER, NOW)).toBe("live");
    expect(offerStatus({ ...OFFER, is_active: false }, NOW)).toBe("inactive");
    expect(offerStatus({ ...OFFER, starts_at: "2026-10-07T00:00:00Z" }, NOW)).toBe("scheduled");
    expect(offerStatus({ ...OFFER, ends_at: "2026-10-06T12:00:00Z" }, NOW)).toBe("ended");
  });

  it("picks a display title", () => {
    expect(offerTitle(OFFER, "en")).toBe("Launch offer");
    expect(offerTitle({ ...OFFER, translations: { ar: { title: "عرض" } } }, "en")).toBe("عرض");
    expect(offerTitle({ ...OFFER, translations: {} }, "en")).toBe("launch");
  });
});

const DISCOUNT: Discount = {
  id: 1,
  code: "WELCOME10",
  description: "Launch",
  kind: "percent",
  value: 10,
  currency: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
  max_redemptions: null,
  redemptions_count: 2,
  created_at: "2026-10-06T12:00:00Z",
  updated_at: "2026-10-06T12:00:00Z",
};

describe("discount form", () => {
  it("round-trips a percent code", () => {
    const form = discountToForm(DISCOUNT);
    expect(form).toMatchObject({
      kind: "percent",
      percent: "10",
      amount_cents: null,
      max_redemptions: "",
    });
    expect(discountPatch(form, form)).toEqual({});
    expect(discountPayload(form)).toMatchObject({ code: "WELCOME10", value: 10, currency: null });
  });

  it("builds a fixed-amount payload", () => {
    const form = {
      ...discountToForm(null, "EUR"),
      code: "spring 5",
      kind: "fixed" as const,
      amount_cents: 500,
      max_redemptions: "100",
    };
    expect(discountPayload(form)).toMatchObject({
      code: "SPRING5",
      kind: "fixed",
      value: 500,
      currency: "EUR",
      max_redemptions: 100,
    });
  });

  it("validates codes, values, currency and limits", () => {
    const base = discountToForm(null);
    expect(Object.keys(validateDiscount(base)).sort()).toEqual(["code", "value"]);
    expect(validateDiscount({ ...base, code: "AB", percent: "10" }).code).toMatch(/3–64/);
    expect(validateDiscount({ ...base, code: "OK10", percent: "101" }).value).toMatch(/1 to 100/);
    expect(validateDiscount({ ...base, code: "OK10", percent: "10" })).toEqual({});
    const fixed = { ...base, code: "FIX", kind: "fixed" as const, currency: "us" };
    expect(Object.keys(validateDiscount(fixed)).sort()).toEqual(["currency", "value"]);
    expect(
      validateDiscount({ ...base, code: "OK10", percent: "10", max_redemptions: "0" })
        .max_redemptions,
    ).toBeDefined();
    expect(normalizeCode("welcome 10")).toBe("WELCOME10");
  });

  it("formats value, usage and state", () => {
    expect(discountValueLabel(DISCOUNT)).toBe("10%");
    expect(discountValueLabel({ kind: "fixed", value: 500, currency: "USD" })).toBe("$5.00");
    expect(discountUsage(DISCOUNT)).toEqual({ label: "2 / ∞", fraction: null });
    expect(discountUsage({ redemptions_count: 5, max_redemptions: 10 })).toEqual({
      label: "5 / 10",
      fraction: 0.5,
    });
    expect(discountState(DISCOUNT, NOW)).toBe("active");
    expect(discountState({ ...DISCOUNT, is_active: false }, NOW)).toBe("inactive");
    expect(discountState({ ...DISCOUNT, starts_at: "2026-10-07T00:00:00Z" }, NOW)).toBe(
      "scheduled",
    );
    expect(discountState({ ...DISCOUNT, ends_at: "2026-10-01T00:00:00Z" }, NOW)).toBe("expired");
    expect(discountState({ ...DISCOUNT, max_redemptions: 2 }, NOW)).toBe("exhausted");
    expect(discountOptionLabel(DISCOUNT, NOW)).toBe("WELCOME10 · 10% off");
    expect(discountOptionLabel({ ...DISCOUNT, is_active: false }, NOW)).toBe(
      "WELCOME10 · 10% off · inactive",
    );
  });
});
