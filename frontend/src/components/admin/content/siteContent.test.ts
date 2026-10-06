import { describe, expect, it } from "vitest";
import type { ContentKey } from "@/lib/admin/types";
import {
  applySaved,
  changedItems,
  changeSummary,
  contentControl,
  countChanges,
  filterKeys,
  groupKeys,
  isKeyChanged,
  keyPath,
  keyTranslationState,
  lineCount,
  missingLocales,
  untranslatedCount,
  type ContentByLocale,
} from "./siteContent";

const key = (
  name: string,
  format: ContentKey["format"] = "text",
  description = "",
): ContentKey => ({
  key: name,
  format,
  group: name.split(".")[0],
  description,
});

const KEYS: ContentKey[] = [
  key("seo.home.title", "text", "Home page <title>"),
  key("home.hero.title", "text", "Hero title"),
  key("home.plans.free.features", "lines", "Free plan features"),
  key("legal.privacy.body", "markdown", "Privacy policy"),
  key("home.faq.a1", "text", "FAQ answer 1"),
  key("custom.thing", "text", "Unknown group"),
];

describe("grouping and controls", () => {
  it("groups keys in the canonical order, unknown groups last", () => {
    const groups = groupKeys(KEYS);
    expect(groups.map((g) => g.group)).toEqual(["home", "legal", "seo", "custom"]);
    expect(groups[0].label).toBe("Home page");
    expect(groups[0].keys.map((k) => k.key)).toEqual([
      "home.hero.title",
      "home.plans.free.features",
      "home.faq.a1",
    ]);
    expect(groups[3].label).toBe("Custom");
  });

  it("picks a control per key format", () => {
    expect(contentControl(key("home.hero.title"))).toBe("input");
    expect(contentControl(key("home.faq.q3"))).toBe("input");
    expect(contentControl(key("company.email"))).toBe("input");
    expect(contentControl(key("home.faq.a3"))).toBe("textarea");
    expect(contentControl(key("seo.home.description"))).toBe("textarea");
    expect(contentControl(key("reading.includes", "lines"))).toBe("lines");
    expect(contentControl(key("contact.body", "markdown"))).toBe("markdown");
  });

  it("formats key paths and counts list lines", () => {
    expect(keyPath("home.hero.title")).toBe("hero › title");
    expect(keyPath("contact")).toBe("contact");
    expect(lineCount("One\n\n  Two  \n")).toBe(2);
  });
});

describe("translation state", () => {
  it("classifies keys", () => {
    expect(keyTranslationState({ en: "a", ar: "b" }, ["en", "ar"])).toBe("complete");
    expect(keyTranslationState({ en: "a", ar: " " }, ["en", "ar"])).toBe("untranslated");
    expect(keyTranslationState({ en: "", ar: undefined }, ["en", "ar"])).toBe("empty");
  });

  it("lists the missing locales of an untranslated key", () => {
    const drafts: ContentByLocale = { en: { k: "Hello" }, ar: { k: "" } };
    expect(missingLocales(drafts, "k", ["en", "ar"])).toEqual(["ar"]);
    expect(missingLocales({ en: { k: "" }, ar: { k: "" } }, "k", ["en", "ar"])).toEqual([]);
  });
});

describe("dirty tracking", () => {
  const originals: ContentByLocale = {
    en: { a: "One", b: "Two" },
    ar: { a: "واحد", b: "" },
  };

  it("finds changed keys per locale", () => {
    const drafts: ContentByLocale = {
      en: { a: "One!", b: "Two" },
      ar: { a: "واحد", b: "اثنان" },
    };
    expect(changedItems(originals.en, drafts.en)).toEqual({ a: "One!" });
    expect(countChanges(originals, drafts, ["en", "ar"])).toEqual({ en: 1, ar: 1 });
    expect(isKeyChanged(originals, drafts, "b", "ar")).toBe(true);
    expect(isKeyChanged(originals, drafts, "b", "en")).toBe(false);
    expect(changeSummary({ en: 1, ar: 2 }, (l) => (l === "en" ? "English" : "Arabic"))).toBe(
      "English 1 · Arabic 2",
    );
    expect(changeSummary({ en: 0, ar: 2 }, (l) => l)).toBe("ar 2");
  });

  it("keeps edits made while a save was running", () => {
    const sent = { a: "One! ", b: "Two" };
    const saved = { a: "One!", b: "Two" }; // the API trims
    // Key "b" was edited again after sending.
    const draft = { a: "One! ", b: "Two (again)" };
    expect(applySaved(draft, sent, saved)).toEqual({ a: "One!", b: "Two (again)" });
  });
});

describe("filtering", () => {
  const locales = ["en", "ar"];
  const originals: ContentByLocale = {
    en: {
      "home.hero.title": "Two Traditions",
      "legal.privacy.body": "Policy",
      "seo.home.title": "",
    },
    ar: { "home.hero.title": "تقليدان", "legal.privacy.body": "", "seo.home.title": "" },
  };
  const drafts: ContentByLocale = {
    en: { ...originals.en, "seo.home.title": "Zodiac Blend" },
    ar: { ...originals.ar },
  };
  const keys = KEYS.slice(0, 4);

  it("searches keys, descriptions and values in every locale", () => {
    const match = (query: string) =>
      filterKeys(
        keys,
        { query, group: "", untranslated: false, changed: false },
        originals,
        drafts,
        locales,
      ).map((k) => k.key);
    expect(match("hero")).toEqual(["home.hero.title"]);
    expect(match("PRIVACY")).toEqual(["legal.privacy.body"]);
    expect(match("تقليدان")).toEqual(["home.hero.title"]);
    expect(match("")).toHaveLength(4);
  });

  it("filters by group, untranslated and changed", () => {
    const run = (filter: Partial<Parameters<typeof filterKeys>[1]>) =>
      filterKeys(
        keys,
        { query: "", group: "", untranslated: false, changed: false, ...filter },
        originals,
        drafts,
        locales,
      ).map((k) => k.key);
    expect(run({ group: "legal" })).toEqual(["legal.privacy.body"]);
    expect(run({ untranslated: true })).toEqual([
      "seo.home.title",
      "home.plans.free.features",
      "legal.privacy.body",
    ]);
    expect(run({ changed: true })).toEqual(["seo.home.title"]);
    expect(untranslatedCount(keys, drafts, locales)).toBe(3);
  });
});
