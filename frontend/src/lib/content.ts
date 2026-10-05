import { getMessages } from "next-intl/server";
import { isAppLocale, routing } from "@/i18n/routing";
import { cache } from "react";
import { apiGet } from "./api/server";
import { createContentAccessor, type SiteContentAccessor } from "./content-core";
import type { SiteContent } from "./types";

export type { SiteContentAccessor } from "./content-core";
export type { ContentKey } from "./content-keys";

/** Cache tag of GET /site-content (call `revalidateTag(SITE_CONTENT_TAG, "max")` after edits). */
export const SITE_CONTENT_TAG = "site-content";

/**
 * Editable copy for Server Components (keys: backend/app/content/keys.py, src/lib/content-keys.ts).
 *
 *   const c = await getSiteContent(locale);
 *   <h1>{c.t("home.hero.title")}</h1>
 *   <ul>{c.lines("home.plans.free.features").map(...)}</ul>
 *   <div className="prose-zb" dangerouslySetInnerHTML={{ __html: c.html("legal.terms.body") }} />
 *
 * Falls back to `content.*` in messages/<locale>.json when the API is down or a value is empty.
 * Deduplicated per request (React cache) and cached for 60 s (ISR).
 */
export const getSiteContent = cache(async (locale: string): Promise<SiteContentAccessor> => {
  const [data, messages] = await Promise.all([
    apiGet<SiteContent>("/site-content", { locale, revalidate: 60, tags: [SITE_CONTENT_TAG] }),
    getMessages({ locale: isAppLocale(locale) ? locale : routing.defaultLocale }),
  ]);
  return createContentAccessor(locale, data, messages.content);
});
