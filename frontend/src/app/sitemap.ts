import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

/** Public static pages (locale-less). Dynamic pages (blog posts, offers, library) can be appended. */
const STATIC_PATHS = ["/", "/free", "/reading", "/offers", "/library", "/blog", "/privacy", "/terms", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const url = (locale: string, path: string) => `${base}/${locale}${path === "/" ? "" : path}`;
  return STATIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: url(locale, path),
      changeFrequency: path === "/" || path === "/blog" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, url(l, path)])),
      },
    })),
  );
}
