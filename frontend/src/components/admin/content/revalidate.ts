"use server";

import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api/server";
import { CACHE_TAGS, type CacheTag } from "@/lib/api/tags";

const ALLOWED_TAGS = new Set<string>(Object.values(CACHE_TAGS));

export interface RevalidateResult {
  ok: boolean;
  tags: CacheTag[];
}

/**
 * Server Action: mark the public pages' cached API reads stale after a dashboard save, so the
 * next visit refreshes them (stale-while-revalidate, `"max"` profile) instead of waiting for the
 * read's own `revalidate` window.
 *
 *   await adminApi.patch(`/offers/${id}`, body);
 *   void refreshPublicContent([CACHE_TAGS.offers]);
 *
 * Server Actions are public endpoints, so the caller's admin session is checked against the API
 * (`GET /admin/auth/me` with the browser's cookies) and only known cache tags are accepted.
 */
export async function refreshPublicContent(tags: CacheTag[]): Promise<RevalidateResult> {
  const wanted = Array.isArray(tags)
    ? [...new Set(tags.filter((tag): tag is CacheTag => ALLOWED_TAGS.has(String(tag))))]
    : [];
  if (!wanted.length) return { ok: false, tags: [] };

  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return { ok: false, tags: [] };
  try {
    const res = await fetch(`${serverApiBaseUrl()}/api/v1/admin/auth/me`, {
      headers: { Accept: "application/json", Cookie: cookieHeader },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, tags: [] };
  } catch {
    return { ok: false, tags: [] };
  }

  for (const tag of wanted) revalidateTag(tag, "max");
  return { ok: true, tags: wanted };
}
