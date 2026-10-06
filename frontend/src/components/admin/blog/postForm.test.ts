import { describe, expect, it } from "vitest";
import type { PostAdmin } from "@/lib/admin/types";
import {
  DEFAULT_AUTHOR,
  isFutureDate,
  postCreatePayload,
  postDisplayStatus,
  postPatch,
  postToForm,
  primaryPublishAction,
  publicPostPath,
  titledLocales,
  validatePost,
} from "./postForm";

const POST: PostAdmin = {
  id: 3,
  slug: "what-is-a-bazi-chart",
  status: "published",
  title: "What is a BaZi chart?",
  author_name: "Zodiac Blend",
  cover_image_url: null,
  published_at: "2026-10-04T12:00:00Z",
  available_locales: ["en"],
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-04T12:00:00Z",
  translations: {
    en: {
      title: "What is a BaZi chart?",
      excerpt: "Four pillars",
      body: "# Body",
      seo_title: "",
      seo_description: "",
    },
  },
};

const NOW = Date.parse("2026-10-06T12:00:00Z");

describe("post form", () => {
  it("maps a post and detects no changes", () => {
    const form = postToForm(POST, ["en", "ar"]);
    expect(form.translations.ar).toEqual({
      title: "",
      excerpt: "",
      body: "",
      seo_title: "",
      seo_description: "",
    });
    expect(postPatch(form, form)).toEqual({});
  });

  it("creates with defaults", () => {
    const form = postToForm(null, ["en", "ar"]);
    expect(form.author_name).toBe(DEFAULT_AUTHOR);
    const payload = postCreatePayload({
      ...form,
      slug: " My-Post ",
      author_name: "  ",
      translations: { ...form.translations, en: { ...form.translations.en!, title: " Hello " } },
    });
    expect(payload).toEqual({
      slug: "my-post",
      author_name: DEFAULT_AUTHOR,
      cover_image_url: null,
      translations: {
        en: { title: "Hello", excerpt: "", body: "", seo_title: "", seo_description: "" },
      },
    });
  });

  it("patches the publication date and translations", () => {
    const initial = postToForm(POST, ["en", "ar"]);
    const edited = {
      ...initial,
      published_at: "2026-11-01T09:00:00.000Z",
      translations: {
        ...initial.translations,
        ar: { ...initial.translations.ar!, title: "ما هي خريطة با زي؟" },
      },
    };
    const patch = postPatch(initial, edited);
    expect(patch.published_at).toBe("2026-11-01T09:00:00.000Z");
    expect(Object.keys(patch.translations ?? {})).toEqual(["en", "ar"]);
    expect(titledLocales(edited, ["en", "ar"])).toEqual(["en", "ar"]);
  });

  it("validates slug, titles and lengths", () => {
    const empty = postToForm(null, ["en", "ar"]);
    expect(Object.keys(validatePost(empty, "en")).sort()).toEqual([
      "slug",
      "translations.en.title",
    ]);
    expect(validatePost(postToForm(POST, ["en", "ar"]), "en")).toEqual({});
    const long = postToForm(POST, ["en"]);
    long.translations.en!.excerpt = "x".repeat(501);
    expect(validatePost(long, "en")["translations.en.excerpt"]).toMatch(/500/);
  });
});

describe("publishing", () => {
  it("derives the displayed status", () => {
    expect(postDisplayStatus(POST, NOW)).toBe("published");
    expect(postDisplayStatus({ ...POST, published_at: "2026-10-10T00:00:00Z" }, NOW)).toBe(
      "scheduled",
    );
    expect(postDisplayStatus({ ...POST, status: "draft" }, NOW)).toBe("draft");
  });

  it("picks the primary action", () => {
    expect(primaryPublishAction("draft", null, NOW)).toBe("publish");
    expect(primaryPublishAction("draft", "2026-10-01T00:00:00Z", NOW)).toBe("publish");
    expect(primaryPublishAction("draft", "2026-10-10T00:00:00Z", NOW)).toBe("schedule");
    expect(primaryPublishAction("published", null, NOW)).toBe("unpublish");
    expect(primaryPublishAction("scheduled", "2026-10-10T00:00:00Z", NOW)).toBe("unpublish");
  });

  it("compares dates", () => {
    expect(isFutureDate("2026-10-07T00:00:00Z", NOW)).toBe(true);
    expect(isFutureDate("2026-10-06T12:00:00Z", NOW)).toBe(false);
    expect(isFutureDate(null, NOW)).toBe(false);
    expect(isFutureDate("garbage", NOW)).toBe(false);
  });

  it("builds public paths", () => {
    expect(publicPostPath("ar", "my post")).toBe("/ar/blog/my%20post");
  });
});
