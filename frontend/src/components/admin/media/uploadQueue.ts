/**
 * Upload queue of the media library: files are uploaded one after another (sequentially, so a
 * slow connection is not saturated and errors stay attributable), each with its own progress.
 * Pure reducer — the File objects live outside the state, keyed by `id`.
 */
import type { MediaItem } from "@/lib/admin/types";

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  /** 0..1 */
  progress: number;
  error: string | null;
  media: MediaItem | null;
  /** False for files rejected before upload (wrong type, too large): retrying cannot help. */
  retryable: boolean;
}

export type UploadAction =
  | { type: "add"; items: Array<{ id: string; name: string; size: number; error?: string | null }> }
  | { type: "start"; id: string }
  | { type: "progress"; id: string; progress: number }
  | { type: "success"; id: string; media: MediaItem }
  | { type: "fail"; id: string; error: string; retryable?: boolean }
  | { type: "cancel"; id: string }
  | { type: "retry"; id: string }
  | { type: "dismiss"; id: string }
  | { type: "clearFinished" };

const FINISHED: UploadStatus[] = ["done", "error", "cancelled"];

function update(state: UploadItem[], id: string, patch: (item: UploadItem) => UploadItem) {
  return state.map((item) => (item.id === id ? patch(item) : item));
}

export function uploadReducer(state: UploadItem[], action: UploadAction): UploadItem[] {
  switch (action.type) {
    case "add":
      return [
        ...state,
        ...action.items.map((item) => ({
          id: item.id,
          name: item.name,
          size: item.size,
          // Files rejected by the client-side check never reach the server.
          status: (item.error ? "error" : "queued") as UploadStatus,
          progress: 0,
          error: item.error ?? null,
          media: null,
          retryable: !item.error,
        })),
      ];
    case "start":
      return update(state, action.id, (item) =>
        item.status === "queued"
          ? { ...item, status: "uploading", progress: 0, error: null }
          : item,
      );
    case "progress":
      return update(state, action.id, (item) =>
        item.status === "uploading"
          ? { ...item, progress: Math.max(item.progress, Math.min(1, action.progress)) }
          : item,
      );
    case "success":
      return update(state, action.id, (item) => ({
        ...item,
        status: "done",
        progress: 1,
        error: null,
        media: action.media,
      }));
    case "fail":
      return update(state, action.id, (item) =>
        item.status === "cancelled"
          ? item
          : {
              ...item,
              status: "error",
              error: action.error,
              retryable: action.retryable ?? item.retryable,
            },
      );
    case "cancel":
      return update(state, action.id, (item) =>
        item.status === "queued" || item.status === "uploading"
          ? { ...item, status: "cancelled", progress: 0 }
          : item,
      );
    case "retry":
      return update(state, action.id, (item) =>
        item.retryable && (item.status === "error" || item.status === "cancelled")
          ? { ...item, status: "queued", progress: 0, error: null }
          : item,
      );
    case "dismiss":
      return state.filter((item) => item.id !== action.id || !FINISHED.includes(item.status));
    case "clearFinished":
      return state.filter((item) => !FINISHED.includes(item.status));
    default:
      return state;
  }
}

/** The next file to upload, unless one is already uploading. */
export function nextUpload(state: UploadItem[]): UploadItem | null {
  if (state.some((item) => item.status === "uploading")) return null;
  return state.find((item) => item.status === "queued") ?? null;
}

export function queueSummary(state: UploadItem[]) {
  const count = (status: UploadStatus) => state.filter((item) => item.status === status).length;
  const pending = count("queued") + count("uploading");
  return {
    total: state.length,
    pending,
    done: count("done"),
    failed: count("error"),
    cancelled: count("cancelled"),
    active: pending > 0,
    finished: state.length > 0 && pending === 0,
  };
}

/** Human summary for the aria-live region: "Uploading 2 of 5…", "4 uploaded, 1 failed". */
export function queueStatusText(state: UploadItem[]): string {
  const summary = queueSummary(state);
  if (!summary.total) return "";
  if (summary.active) {
    const position = summary.done + summary.failed + summary.cancelled + 1;
    return `Uploading ${Math.min(position, summary.total)} of ${summary.total}…`;
  }
  const parts = [`${summary.done} uploaded`];
  if (summary.failed) parts.push(`${summary.failed} failed`);
  if (summary.cancelled) parts.push(`${summary.cancelled} cancelled`);
  return parts.join(", ");
}

/* ================================================================== references (409 media_in_use) */

export interface MediaReference {
  entity_type: string;
  id: number | string;
}

const REFERENCE_LABELS: Record<string, { label: string; href: (id: string) => string }> = {
  offer: { label: "Offer", href: (id) => `/admin/offers/${id}` },
  blog_post: { label: "Blog post", href: (id) => `/admin/blog/${id}` },
  book_series: { label: "Library series", href: (id) => `/admin/library#series-${id}` },
  book: { label: "Library book", href: (id) => `/admin/library#book-${id}` },
};

/** `details.references` of a 409 `media_in_use` error (malformed entries are skipped). */
export function mediaReferences(
  details: Record<string, unknown> | null | undefined,
): MediaReference[] {
  const raw = details?.references;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (ref): ref is MediaReference =>
      Boolean(ref) &&
      typeof ref === "object" &&
      typeof (ref as MediaReference).entity_type === "string" &&
      (typeof (ref as MediaReference).id === "number" ||
        typeof (ref as MediaReference).id === "string"),
  );
}

/** "Blog post #3" + dashboard link. */
export function referenceLink(ref: MediaReference): { label: string; href: string | null } {
  const known = REFERENCE_LABELS[ref.entity_type];
  const id = String(ref.id);
  if (!known) return { label: `${ref.entity_type.replace(/_/g, " ")} #${id}`, href: null };
  return { label: `${known.label} #${id}`, href: known.href(encodeURIComponent(id)) };
}

/** Absolute URL of a media path for copying (`/api/v1/media/x.webp` → `https://site/api/v1/media/x.webp`). */
export function absoluteMediaUrl(url: string, origin: string): string {
  try {
    return new URL(url, origin).toString();
  } catch {
    return url;
  }
}

/** "1600 × 900 · 16:9" style dimension label. */
export function dimensionsLabel(width: number | null, height: number | null): string {
  if (!width || !height) return "—";
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(width, height);
  const ratio = `${width / d}:${height / d}`;
  return ratio.length <= 7 ? `${width} × ${height} · ${ratio}` : `${width} × ${height}`;
}
