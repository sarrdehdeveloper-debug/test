import type { MetadataRoute } from "next";
import { getLibrary, getOffers, getPost, getPosts } from "@/components/pages/data";
import {
  buildSitemap,
  mapWithConcurrency,
  type SitemapPage,
} from "@/components/pages/helpers/sitemap";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";
import type { PostSummary } from "@/lib/types";

// Regenerated in the background (ISR); the API reads below are cached and tagged too.
export const revalidate = 3600;

/** Public static pages (locale-less). */
const STATIC_PAGES: SitemapPage[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/free", changeFrequency: "monthly", priority: 0.9 },
  { path: "/reading", changeFrequency: "monthly", priority: 0.9 },
  { path: "/offers", changeFrequency: "weekly", priority: 0.7 },
  { path: "/library", changeFrequency: "monthly", priority: 0.7 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
];

const POSTS_PAGE_SIZE = 50;
/** Safety cap: 40 pages x 50 = 2000 posts. */
const MAX_POST_PAGES = 40;

/** Every published post (all pages of GET /blog); [] when the API is unavailable. */
async function allPosts(locale: string): Promise<PostSummary[]> {
  const first = await getPosts(locale, 1, POSTS_PAGE_SIZE);
  if (!first.ok) return [];
  const pages = Math.min(Math.ceil(first.data.total / POSTS_PAGE_SIZE), MAX_POST_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      getPosts(locale, i + 2, POSTS_PAGE_SIZE),
    ),
  );
  return [first, ...rest].flatMap((r) => (r.ok ? r.data.items : []));
}

/**
 * Static routes per locale, plus published blog posts (in the languages they are written in),
 * live offers and published library series from the API. Fail-safe: when the API is down (e.g.
 * during `next build`) the static routes are still listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locale = routing.defaultLocale;
  const [posts, offers, library] = await Promise.all([
    allPosts(locale),
    getOffers(locale),
    getLibrary(locale),
  ]);

  // available_locales is only on the post detail: fetch them with bounded concurrency.
  const postPages = await mapWithConcurrency(posts, 6, async (post): Promise<SitemapPage> => {
    const detail = await getPost(post.slug, locale);
    return {
      path: `/blog/${post.slug}`,
      locales: detail.ok ? detail.data.available_locales : [locale],
      lastModified: post.published_at,
      changeFrequency: "monthly",
      priority: 0.6,
    };
  });
  const offerPages: SitemapPage[] = (offers.ok ? offers.data.items : []).map((offer) => ({
    path: `/offers/${offer.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));
  const seriesPages: SitemapPage[] = (library.ok ? library.data.items : []).map((series) => ({
    path: `/library/${series.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return buildSitemap([...STATIC_PAGES, ...postPages, ...offerPages, ...seriesPages], {
    base: siteUrl(),
    locales: routing.locales,
    defaultLocale: routing.defaultLocale,
  });
}
