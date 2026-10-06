import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/lib/admin/types";
import {
  absoluteMediaUrl,
  dimensionsLabel,
  mediaReferences,
  nextUpload,
  queueStatusText,
  queueSummary,
  referenceLink,
  uploadReducer,
  type UploadItem,
} from "./uploadQueue";

const MEDIA = { id: 9, url: "/api/v1/media/a.webp" } as MediaItem;

function run(...actions: Parameters<typeof uploadReducer>[1][]): UploadItem[] {
  return actions.reduce(uploadReducer, [] as UploadItem[]);
}

describe("upload queue", () => {
  it("queues valid files and marks rejected ones as errors", () => {
    const state = run({
      type: "add",
      items: [
        { id: "a", name: "a.png", size: 10 },
        { id: "b", name: "b.txt", size: 5, error: "Choose a JPEG, PNG, WEBP or GIF image." },
      ],
    });
    expect(state.map((i) => i.status)).toEqual(["queued", "error"]);
    expect(state[1].retryable).toBe(false);
    // A file rejected before upload cannot be retried.
    expect(uploadReducer(state, { type: "retry", id: "b" })[1].status).toBe("error");
    expect(nextUpload(state)?.id).toBe("a");
  });

  it("uploads sequentially", () => {
    const state = run(
      {
        type: "add",
        items: [
          { id: "a", name: "a.png", size: 10 },
          { id: "b", name: "b.png", size: 10 },
        ],
      },
      { type: "start", id: "a" },
      { type: "progress", id: "a", progress: 0.4 },
      { type: "progress", id: "a", progress: 0.2 }, // never goes backwards
    );
    expect(state[0]).toMatchObject({ status: "uploading", progress: 0.4 });
    expect(nextUpload(state)).toBeNull();
    expect(queueStatusText(state)).toBe("Uploading 1 of 2…");
    const after = run(
      ...[
        {
          type: "add" as const,
          items: [
            { id: "a", name: "a.png", size: 1 },
            { id: "b", name: "b.png", size: 1 },
          ],
        },
        { type: "start" as const, id: "a" },
        { type: "success" as const, id: "a", media: MEDIA },
      ],
    );
    expect(after[0]).toMatchObject({ status: "done", progress: 1, media: MEDIA });
    expect(nextUpload(after)?.id).toBe("b");
  });

  it("handles failures, cancel, retry and cleanup", () => {
    let state = run(
      {
        type: "add",
        items: [
          { id: "a", name: "a.png", size: 1 },
          { id: "b", name: "b.png", size: 1 },
        ],
      },
      { type: "start", id: "a" },
      { type: "fail", id: "a", error: "The file is too large (maximum 5 MB)." },
      { type: "cancel", id: "b" },
    );
    expect(state.map((i) => i.status)).toEqual(["error", "cancelled"]);
    expect(queueSummary(state)).toMatchObject({
      failed: 1,
      cancelled: 1,
      active: false,
      finished: true,
    });
    expect(queueStatusText(state)).toBe("0 uploaded, 1 failed, 1 cancelled");
    // A failure arriving after cancel does not overwrite it.
    expect(uploadReducer(state, { type: "fail", id: "b", error: "x" })[1].status).toBe("cancelled");
    state = uploadReducer(state, { type: "retry", id: "a" });
    expect(state[0]).toMatchObject({ status: "queued", error: null });
    // The server rejecting the file itself (422) is final.
    const rejected = uploadReducer(uploadReducer(state, { type: "start", id: "a" }), {
      type: "fail",
      id: "a",
      error: "Upload a valid JPEG, PNG, WEBP or GIF image.",
      retryable: false,
    });
    expect(uploadReducer(rejected, { type: "retry", id: "a" })[0].status).toBe("error");
    state = uploadReducer(state, { type: "dismiss", id: "b" });
    expect(state.map((i) => i.id)).toEqual(["a"]);
    state = uploadReducer(state, { type: "dismiss", id: "a" }); // queued items stay
    expect(state).toHaveLength(1);
    state = uploadReducer(
      uploadReducer(uploadReducer(state, { type: "start", id: "a" }), {
        type: "success",
        id: "a",
        media: MEDIA,
      }),
      { type: "clearFinished" },
    );
    expect(state).toEqual([]);
  });
});

describe("media helpers", () => {
  it("reads media_in_use references", () => {
    const refs = mediaReferences({
      references: [
        { entity_type: "offer", id: 1 },
        { entity_type: "book", id: 4 },
        { bad: true },
        null,
      ],
    });
    expect(refs).toHaveLength(2);
    expect(referenceLink(refs[0])).toEqual({ label: "Offer #1", href: "/admin/offers/1" });
    expect(referenceLink(refs[1])).toEqual({
      label: "Library book #4",
      href: "/admin/library#book-4",
    });
    expect(referenceLink({ entity_type: "blog_post", id: 3 }).href).toBe("/admin/blog/3");
    expect(referenceLink({ entity_type: "user_avatar", id: 2 })).toEqual({
      label: "user avatar #2",
      href: null,
    });
    expect(mediaReferences(undefined)).toEqual([]);
  });

  it("formats URLs and dimensions", () => {
    expect(absoluteMediaUrl("/api/v1/media/a.webp", "https://zodiacblend.com")).toBe(
      "https://zodiacblend.com/api/v1/media/a.webp",
    );
    expect(absoluteMediaUrl("https://cdn.example.com/x.png", "https://zodiacblend.com")).toBe(
      "https://cdn.example.com/x.png",
    );
    expect(dimensionsLabel(1600, 900)).toBe("1600 × 900 · 16:9");
    expect(dimensionsLabel(1601, 900)).toBe("1601 × 900");
    expect(dimensionsLabel(null, 10)).toBe("—");
  });
});
