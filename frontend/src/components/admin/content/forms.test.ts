import { describe, expect, it } from "vitest";
import type { OfferTranslation, Translations } from "@/lib/admin/types";
import {
  cleanTranslations,
  clearErrors,
  counterTone,
  diffFields,
  errorLocales,
  errorSummary,
  fieldLabel,
  fillTranslations,
  isSameValue,
  mergeErrors,
  normalizeFieldErrors,
  parseSortOrder,
  slugify,
  validateLink,
  validateSlug,
  validateTranslations,
  windowError,
} from "./forms";
import { isInternalNavigation } from "./useUnsavedChanges";

describe("slugs and links", () => {
  it("slugifies titles", () => {
    expect(slugify("Launch Offer: 10% off!")).toBe("launch-offer-10-off");
    expect(slugify("  Équinoxe d'automne  ")).toBe("equinoxe-d-automne");
    expect(slugify("عرض الإطلاق")).toBe("");
    expect(slugify("a".repeat(130))).toHaveLength(120);
    expect(slugify("abc def", 4)).toBe("abc");
  });

  it("validates slugs like the API", () => {
    expect(validateSlug("")).toBe("Enter a slug.");
    expect(validateSlug("a")).toMatch(/2–120/);
    expect(validateSlug("Bad Slug")).toMatch(/lower-case/);
    expect(validateSlug("test-offer-1")).toBeNull();
    expect(validateSlug(" Test-Offer ")).toBeNull(); // trimmed + lower-cased by the API
    expect(validateSlug("a".repeat(150), 160)).toBeNull();
    expect(validateSlug("a".repeat(150))).toMatch(/2–120/);
  });

  it("accepts site paths and http(s) URLs only", () => {
    expect(validateLink("")).toBeNull();
    expect(validateLink("/reading")).toBeNull();
    expect(validateLink("https://example.com/book")).toBeNull();
    expect(validateLink("//evil.com")).not.toBeNull();
    expect(validateLink("javascript:alert(1)")).not.toBeNull();
    expect(validateLink("/a b")).not.toBeNull();
    expect(validateLink("/\\evil.com")).not.toBeNull();
    expect(validateLink("example.com")).not.toBeNull();
    expect(validateLink(`/${"a".repeat(500)}`)).toMatch(/500/);
  });
});

describe("numbers and windows", () => {
  it("parses sort orders", () => {
    expect(parseSortOrder("")).toBe(0);
    expect(parseSortOrder(" 12 ")).toBe(12);
    expect(parseSortOrder("-3")).toBe(-3);
    expect(parseSortOrder("1.5")).toBeUndefined();
    expect(parseSortOrder("abc")).toBeUndefined();
    expect(parseSortOrder("2000000")).toBeUndefined();
  });

  it("checks date windows", () => {
    expect(windowError(null, "2026-01-01T00:00:00Z")).toBeNull();
    expect(windowError("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toMatch(/after/);
    expect(windowError("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")).toMatch(/after/);
    expect(windowError("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBeNull();
  });
});

describe("diffs", () => {
  it("compares JSON values deeply, ignoring key order", () => {
    expect(isSameValue({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(isSameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(isSameValue(null, null)).toBe(true);
  });

  it("returns only changed top-level fields", () => {
    const before = { slug: "a", translations: { en: { title: "T" } }, sort_order: 1 };
    const after = { slug: "a", translations: { en: { title: "T2" } }, sort_order: 1 };
    expect(diffFields(before, after)).toEqual({ translations: { en: { title: "T2" } } });
    expect(diffFields(before, { ...before })).toEqual({});
  });
});

describe("translations", () => {
  const value: Translations<OfferTranslation> = {
    en: { title: " Launch ", subtitle: "", body: "Body ", cta_label: "" },
    ar: { title: "", subtitle: " ", body: "", cta_label: "" },
  };

  it("trims fields and drops blank locales", () => {
    expect(cleanTranslations(value)).toEqual({
      en: { title: "Launch", subtitle: "", body: "Body", cta_label: "" },
    });
  });

  it("fills every field for controlled inputs", () => {
    const filled = fillTranslations<{ title: string; body: string }>(
      { en: { title: "T" }, fr: { title: "F" } },
      ["en", "ar"],
      ["title", "body"],
    );
    expect(filled).toEqual({
      en: { title: "T", body: "" },
      ar: { title: "", body: "" },
      fr: { title: "F", body: "" },
    });
  });

  it("requires a default title and titles for partial locales", () => {
    expect(validateTranslations(value, { defaultLocale: "en" })).toEqual({});
    const missingDefault = validateTranslations(
      { en: { title: "", body: "x" }, ar: { title: "عنوان" } },
      { defaultLocale: "en" },
    );
    expect(missingDefault).toEqual({ "translations.en.title": "A title is required." });
    const partial = validateTranslations(
      { en: { title: "T" }, ar: { title: "", body: "نص" } },
      { defaultLocale: "en" },
    );
    expect(Object.keys(partial)).toEqual(["translations.ar.title"]);
    const tooLong = validateTranslations(
      { en: { title: "x".repeat(201) } },
      { defaultLocale: "en", maxLengths: { title: 200 } },
    );
    expect(tooLong["translations.en.title"]).toMatch(/200/);
  });

  it("moves translation errors of the API onto the title field", () => {
    expect(
      normalizeFieldErrors({
        translations: "Translation 'ar' needs a title",
        slug: "Use 2-120 characters",
      }),
    ).toEqual({
      "translations.ar.title": "Add a title, or clear this language to leave it untranslated.",
      slug: "Use 2-120 characters",
    });
    expect(
      normalizeFieldErrors({
        translations: "A title in the default locale (en) is required",
      }),
    ).toEqual({ "translations.en.title": "A title is required." });
    expect(normalizeFieldErrors({ translations: "Unsupported locale(s): fr" })).toEqual({
      translations: "Unsupported locale(s): fr",
    });
  });

  it("lists locales with errors", () => {
    expect(
      errorLocales({ "translations.ar.title": "x", "translations.ar.body": "y", slug: "z" }),
    ).toEqual(["ar"]);
  });
});

describe("error maps", () => {
  it("merges and clears errors", () => {
    const merged = mergeErrors({ slug: "a", title: null }, { slug: "b", cta_url: "c" });
    expect(merged).toEqual({ slug: "b", cta_url: "c" });
    expect(clearErrors({ slug: "a", "translations.en.title": "b" }, "translations")).toEqual({
      slug: "a",
    });
    const same = { slug: "a" };
    expect(clearErrors(same, "title")).toBe(same);
  });

  it("rates counter lengths", () => {
    expect(counterTone(10, 70)).toBe("ok");
    expect(counterTone(63, 70)).toBe("near");
    expect(counterTone(71, 70)).toBe("over");
  });
});

describe("isInternalNavigation", () => {
  const current = { origin: "http://localhost:3000", pathname: "/admin/offers/1", search: "" };
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const anchor = (href: string, attrs: Record<string, string> = {}) => ({
    href: new URL(href, current.origin).toString(),
    target: attrs.target ?? "",
    hasAttribute: (name: string) => name in attrs,
  });

  it("detects same-tab navigation to another page", () => {
    expect(isInternalNavigation(anchor("/admin/offers"), click, current)).toBe(true);
    expect(isInternalNavigation(anchor("/admin/offers/1?x=1"), click, current)).toBe(true);
  });

  it("ignores new tabs, downloads, other origins and same-page anchors", () => {
    expect(
      isInternalNavigation(anchor("/admin/offers"), { ...click, metaKey: true }, current),
    ).toBe(false);
    expect(isInternalNavigation(anchor("/x", { target: "_blank" }), click, current)).toBe(false);
    expect(isInternalNavigation(anchor("/x", { download: "" }), click, current)).toBe(false);
    expect(isInternalNavigation(anchor("https://example.com/"), click, current)).toBe(false);
    expect(isInternalNavigation(anchor("/admin/offers/1#top"), click, current)).toBe(false);
  });
});

describe("error summaries", () => {
  it("labels fields", () => {
    expect(fieldLabel("translations.ar.title")).toBe("Arabic title");
    expect(fieldLabel("translations.en.cta_label")).toBe("English cta label");
    expect(fieldLabel("cta_url", { cta_url: "Button link" })).toBe("Button link");
    expect(fieldLabel("sort_order")).toBe("Sort order");
    expect(errorSummary({ slug: "Taken." })).toEqual(["Slug: Taken."]);
  });
});
