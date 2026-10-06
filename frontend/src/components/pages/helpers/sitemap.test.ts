import { describe, expect, it } from "vitest";
import { buildSitemap, localizedUrl, mapWithConcurrency } from "./sitemap";

const options = { base: "https://zodiacblend.com/", locales: ["en", "ar"], defaultLocale: "en" };

describe("sitemap", () => {
  it("builds localized URLs", () => {
    expect(localizedUrl("https://zodiacblend.com/", "ar", "/")).toBe("https://zodiacblend.com/ar");
    expect(localizedUrl("https://zodiacblend.com", "en", "/blog/x")).toBe(
      "https://zodiacblend.com/en/blog/x",
    );
  });

  it("lists every locale with hreflang alternates and x-default", () => {
    const map = buildSitemap(
      [{ path: "/offers", priority: 0.7, changeFrequency: "weekly" }],
      options,
    );
    expect(map.map((e) => e.url)).toEqual([
      "https://zodiacblend.com/en/offers",
      "https://zodiacblend.com/ar/offers",
    ]);
    expect(map[1]).toEqual({
      url: "https://zodiacblend.com/ar/offers",
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          en: "https://zodiacblend.com/en/offers",
          ar: "https://zodiacblend.com/ar/offers",
          "x-default": "https://zodiacblend.com/en/offers",
        },
      },
    });
  });

  it("limits posts to their languages and keeps valid dates only", () => {
    const map = buildSitemap(
      [
        { path: "/blog/en-only", locales: ["en"], lastModified: "2026-10-04T12:00:00Z" },
        { path: "/blog/ar-only", locales: ["ar", "fr"], lastModified: "not a date" },
        { path: "/blog/none", locales: ["fr"] },
      ],
      options,
    );
    expect(map.map((e) => e.url)).toEqual([
      "https://zodiacblend.com/en/blog/en-only",
      "https://zodiacblend.com/ar/blog/ar-only",
    ]);
    expect(map[0].lastModified).toEqual(new Date("2026-10-04T12:00:00Z"));
    expect(map[0].alternates?.languages).toEqual({
      en: "https://zodiacblend.com/en/blog/en-only",
      "x-default": "https://zodiacblend.com/en/blog/en-only",
    });
    expect(map[1]).not.toHaveProperty("lastModified");
    expect(map[1].alternates?.languages).toEqual({ ar: "https://zodiacblend.com/ar/blog/ar-only" });
  });

  it("drops duplicate URLs", () => {
    expect(buildSitemap([{ path: "/" }, { path: "/" }], options)).toHaveLength(2);
  });

  it("maps with bounded concurrency, keeping order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      inFlight--;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});
