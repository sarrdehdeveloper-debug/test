/**
 * Data-cache tags of server-side API reads (`apiGet(path, { tags: [CACHE_TAGS.x] })`).
 * After the admin dashboard saves something, refresh the public pages from a Server Action or
 * Route Handler with `revalidateTag(CACHE_TAGS.siteContent, "max")` (stale-while-revalidate);
 * otherwise they refresh by themselves within each read's `revalidate` window.
 */
export const CACHE_TAGS = {
  /** GET /site-content */
  siteContent: "site-content",
  /** GET /public-config */
  publicConfig: "public-config",
  /** GET /offers, /offers/{slug} */
  offers: "offers",
  /** GET /blog, /blog/{slug} */
  blog: "blog",
  /** GET /library, /library/{slug} */
  library: "library",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
