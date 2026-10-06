import { describe, expect, it } from "vitest";
import type { BookAdmin, SeriesAdmin } from "@/lib/admin/types";
import {
  applyOrder,
  bookPayload,
  libraryPatch,
  libraryTitle,
  libraryToForm,
  moveItem,
  nextSortOrder,
  seriesPayload,
  sortByOrder,
  validateLibrary,
} from "./libraryForm";

const BOOK: BookAdmin = {
  id: 7,
  series_id: 1,
  slug: "the-dragon-and-the-ram",
  translations: { en: { title: "The Dragon and the Ram", description: "Desc" } },
  cover_image_url: null,
  purchase_url: "https://example.com/book",
  is_published: true,
  sort_order: 1,
  created_at: "2026-10-06T12:00:00Z",
  updated_at: "2026-10-06T12:00:00Z",
};

const SERIES: SeriesAdmin = {
  id: 1,
  slug: "galaxy-library-volume-1",
  translations: { en: { title: "Volume 1", description: "" }, ar: { title: "المجلد 1" } },
  cover_image_url: "/api/v1/media/abc.webp",
  is_published: true,
  sort_order: 0,
  books_count: 1,
  books: [BOOK],
  created_at: "2026-10-06T12:00:00Z",
  updated_at: "2026-10-06T12:00:00Z",
};

describe("library forms", () => {
  it("maps series and books to form values", () => {
    const series = libraryToForm(SERIES, ["en", "ar"]);
    expect(series.purchase_url).toBe("");
    expect(series.translations.ar).toEqual({ title: "المجلد 1", description: "" });
    expect(seriesPayload(series)).not.toHaveProperty("purchase_url");
    const book = libraryToForm(BOOK, ["en", "ar"]);
    expect(bookPayload(book)).toMatchObject({
      purchase_url: "https://example.com/book",
      sort_order: 1,
    });
    expect(libraryToForm(null, ["en"], { sort_order: 4 }).sort_order).toBe("4");
  });

  it("diffs edits", () => {
    const initial = libraryToForm(BOOK, ["en", "ar"]);
    expect(libraryPatch("book", initial, initial)).toEqual({});
    expect(
      libraryPatch("book", initial, { ...initial, purchase_url: "", is_published: false }),
    ).toEqual({ purchase_url: null, is_published: false });
    expect(libraryPatch("series", initial, { ...initial, purchase_url: "" })).toEqual({});
  });

  it("validates", () => {
    const empty = libraryToForm(null, ["en", "ar"]);
    expect(
      Object.keys(validateLibrary("book", { ...empty, purchase_url: "ftp://x" }, "en")).sort(),
    ).toEqual(["purchase_url", "slug", "translations.en.title"]);
    expect(validateLibrary("series", libraryToForm(SERIES, ["en", "ar"]), "en")).toEqual({});
  });

  it("titles rows with fallbacks", () => {
    expect(libraryTitle(SERIES, "ar")).toBe("المجلد 1");
    expect(libraryTitle({ ...SERIES, translations: {} }, "en")).toBe("galaxy-library-volume-1");
  });
});

describe("ordering", () => {
  const items = [
    { id: 3, sort_order: 2 },
    { id: 1, sort_order: 0 },
    { id: 2, sort_order: 0 },
  ];

  it("sorts by sort_order then id", () => {
    expect(sortByOrder(items).map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("moves items: swaps distinct neighbours, renumbers ties", () => {
    // Order 1,2,3 → move "2" (index 1) up → 2,1,3 → sort orders 1,2,3.
    expect(moveItem(items, 1, -1)).toEqual([
      { id: 2, sort_order: 1 },
      { id: 1, sort_order: 2 },
      { id: 3, sort_order: 3 },
    ]);
    const numbered = [
      { id: 1, sort_order: 1 },
      { id: 2, sort_order: 2 },
      { id: 3, sort_order: 3 },
    ];
    expect(moveItem(numbered, 2, -1)).toEqual([
      { id: 3, sort_order: 2 },
      { id: 2, sort_order: 3 },
    ]);
    // Distinct orders with gaps: only the two neighbours swap values.
    const gapped = [
      { id: 1, sort_order: 10 },
      { id: 2, sort_order: 20 },
      { id: 3, sort_order: 30 },
    ];
    expect(moveItem(gapped, 0, 1)).toEqual([
      { id: 1, sort_order: 20 },
      { id: 2, sort_order: 10 },
    ]);
    expect(moveItem(numbered, 0, -1)).toEqual([]);
    expect(moveItem(numbered, 2, 1)).toEqual([]);
  });

  it("applies order changes locally and appends new items", () => {
    const numbered = [
      { id: 1, sort_order: 1 },
      { id: 2, sort_order: 2 },
    ];
    expect(applyOrder(numbered, [{ id: 1, sort_order: 3 }]).map((i) => i.id)).toEqual([2, 1]);
    expect(nextSortOrder(numbered)).toBe(3);
    expect(nextSortOrder([])).toBe(1);
  });
});
