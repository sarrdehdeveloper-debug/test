import type { MetadataRoute } from "next";

/**
 * Pure sitemap builder (src/app/sitemap.ts feeds it with API data). Every URL lists its
 * language alternates (hreflang) and x-default; blog posts only in the languages they are
 * written in, matching the page metadata.
 */

export interface SitemapPage {
  /** Locale-less path, e.g. "/" or "/blog/my-post". */
  path: string;
  /** Locales the page exists in (default: all). */
  locales?: readonly string[];
  lastModified?: string | Date | null;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}

export interface SitemapOptions {
  base: string;
  locales: readonly string[];
  defaultLocale: string;
}

export function localizedUrl(base: string, locale: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${locale}${path === "/" ? "" : path}`;
}

export function buildSitemap(pages: SitemapPage[], options: SitemapOptions): MetadataRoute.Sitemap {
  const { base, locales, defaultLocale } = options;
  const seen = new Set<string>();
  const out: MetadataRoute.Sitemap = [];
  for (const page of pages) {
    const pageLocales = (page.locales ?? locales).filter((l) => locales.includes(l));
    if (pageLocales.length === 0) continue;
    const languages: Record<string, string> = {};
    for (const l of pageLocales) languages[l] = localizedUrl(base, l, page.path);
    if (pageLocales.includes(defaultLocale)) {
      languages["x-default"] = localizedUrl(base, defaultLocale, page.path);
    }
    const lastModified =
      page.lastModified && !Number.isNaN(new Date(page.lastModified).getTime())
        ? new Date(page.lastModified)
        : undefined;
    for (const locale of pageLocales) {
      const url = localizedUrl(base, locale, page.path);
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        url,
        ...(lastModified ? { lastModified } : {}),
        ...(page.changeFrequency ? { changeFrequency: page.changeFrequency } : {}),
        ...(page.priority !== undefined ? { priority: page.priority } : {}),
        alternates: { languages },
      });
    }
  }
  return out;
}

/** Run `fn` over `items` with at most `limit` calls in flight (keeps the API load bounded). */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
