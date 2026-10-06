import { cache } from "react";
import { apiGetResult } from "@/lib/api/server";
import { CACHE_TAGS } from "@/lib/api/tags";
import type {
  ItemsResponse,
  OfferOut,
  Paginated,
  PostOut,
  PostSummary,
  SeriesOut,
} from "@/lib/types";

/**
 * Cached API reads of the content pages (Server Components, generateMetadata, sitemap).
 *
 * - React `cache()` dedupes a read between generateMetadata and the page within one request
 *   (fetches with an AbortSignal are not memoised by Next.js).
 * - The data cache keeps each response for `revalidate` seconds and is tagged, so the admin
 *   dashboard can refresh pages at once with `revalidateTag(CACHE_TAGS.x, "max")`.
 * - Every loader returns an ApiResult: `ok:false` + `error.isNotFound` -> 404, otherwise "API down".
 */

/** Posts per blog list page (3 x 3 grid). */
export const BLOG_PAGE_SIZE = 9;

const REVALIDATE = { offers: 60, blog: 120, library: 300 } as const;

export const getOffers = cache((locale: string) =>
  apiGetResult<ItemsResponse<OfferOut>>("/offers", {
    locale,
    revalidate: REVALIDATE.offers,
    tags: [CACHE_TAGS.offers],
  }),
);

export const getOffer = cache((slug: string, locale: string) =>
  apiGetResult<OfferOut>(`/offers/${encodeURIComponent(slug)}`, {
    locale,
    revalidate: REVALIDATE.offers,
    tags: [CACHE_TAGS.offers],
  }),
);

export const getPosts = cache((locale: string, page: number, pageSize: number = BLOG_PAGE_SIZE) =>
  apiGetResult<Paginated<PostSummary>>("/blog", {
    locale,
    query: { page, page_size: pageSize },
    revalidate: REVALIDATE.blog,
    tags: [CACHE_TAGS.blog],
  }),
);

export const getPost = cache((slug: string, locale: string) =>
  apiGetResult<PostOut>(`/blog/${encodeURIComponent(slug)}`, {
    locale,
    revalidate: REVALIDATE.blog,
    tags: [CACHE_TAGS.blog],
  }),
);

export const getLibrary = cache((locale: string) =>
  apiGetResult<ItemsResponse<SeriesOut>>("/library", {
    locale,
    revalidate: REVALIDATE.library,
    tags: [CACHE_TAGS.library],
  }),
);

export const getSeries = cache((slug: string, locale: string) =>
  apiGetResult<SeriesOut>(`/library/${encodeURIComponent(slug)}`, {
    locale,
    revalidate: REVALIDATE.library,
    tags: [CACHE_TAGS.library],
  }),
);
