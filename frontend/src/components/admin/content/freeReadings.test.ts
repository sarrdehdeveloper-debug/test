import { describe, expect, it } from "vitest";
import type { FreeReading } from "@/lib/admin/types";
import {
  changedReadingLocales,
  coverage,
  draftsFor,
  indexReadings,
  parseReadingId,
  readingHint,
  readingId,
  readingName,
  readingState,
  replaceReading,
} from "./freeReadings";

const reading = (patch: Partial<FreeReading>): FreeReading => ({
  id: 1,
  kind: "sign",
  key: "aries",
  locale: "en",
  title: "Aries",
  body: "Body",
  updated_at: "2026-10-06T12:00:00Z",
  ...patch,
});

describe("free readings", () => {
  it("builds and parses reading ids", () => {
    expect(readingId("sign", "aries")).toBe("sign:aries");
    expect(parseReadingId("animal:horse")).toEqual({ kind: "animal", key: "horse" });
    expect(parseReadingId("sign:horse")).toBeNull();
    expect(parseReadingId("planet:mars")).toBeNull();
    expect(parseReadingId(null)).toBeNull();
  });

  it("names readings and gives orientation hints", () => {
    expect(readingName("sagittarius")).toBe("Sagittarius");
    expect(readingHint("sign", "aries")).toBe("21 Mar – 19 Apr");
    expect(readingHint("animal", "horse")).toBe("Years 2026, 2038");
  });

  it("classifies readings", () => {
    expect(readingState(undefined)).toBe("missing");
    expect(readingState({ title: "", body: " " })).toBe("missing");
    expect(readingState({ title: "T", body: "" })).toBe("partial");
    expect(readingState({ title: "T", body: "B" })).toBe("filled");
  });

  it("computes coverage per kind and locale", () => {
    const items = [
      reading({}),
      reading({ locale: "ar", title: "", body: "" }),
      reading({ kind: "animal", key: "rat", title: "Rat", body: "B" }),
    ];
    const index = indexReadings(items);
    expect(coverage(index, ["en"], "sign")).toEqual({ filled: 1, total: 12 });
    expect(coverage(index, ["en", "ar"], "sign")).toEqual({ filled: 1, total: 24 });
    expect(coverage(index, ["en", "ar"])).toEqual({ filled: 2, total: 48 });
  });

  it("tracks changed locales of a draft", () => {
    const index = indexReadings([reading({}), reading({ locale: "ar", title: "الحمل", body: "" })]);
    const original = draftsFor(index, "sign", "aries", ["en", "ar"]);
    expect(original).toEqual({
      en: { title: "Aries", body: "Body" },
      ar: { title: "الحمل", body: "" },
    });
    const draft = { ...original, ar: { title: "الحمل", body: "نص" } };
    expect(changedReadingLocales(original, draft)).toEqual(["ar"]);
    expect(changedReadingLocales(original, original)).toEqual([]);
    expect(draftsFor(index, "sign", "leo", ["en"])).toEqual({ en: { title: "", body: "" } });
  });

  it("replaces a saved reading in the list", () => {
    const items = [reading({}), reading({ locale: "ar" })];
    const saved = reading({ locale: "ar", title: "New" });
    expect(replaceReading(items, saved)[1].title).toBe("New");
    expect(replaceReading(items, reading({ key: "leo" }))).toHaveLength(3);
  });
});
