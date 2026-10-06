import type { CacheTag } from "@/lib/api/tags";
import { refreshPublicContent } from "./revalidate";

/**
 * Fire-and-forget: ask the server to refresh the public pages that read these API endpoints
 * (see `refreshPublicContent`). Failures are ignored — the pages then refresh within their own
 * cache window (about a minute).
 */
export function refreshPublicSite(...tags: CacheTag[]): void {
  if (!tags.length) return;
  refreshPublicContent(tags).catch(() => undefined);
}

/** Shown next to save buttons: when visitors see a saved change. */
export const PUBLIC_REFRESH_NOTE = "Saved changes appear on the public site within about a minute.";
