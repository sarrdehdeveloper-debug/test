"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { adminApi, isAbortError, toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import type { MediaItem } from "@/lib/admin/types";
import { validateImageFile } from "@/lib/admin/upload";
import { nextUpload, uploadReducer, type UploadAction, type UploadItem } from "./uploadQueue";

let counter = 0;

/**
 * Sequential multi-file upload to `POST /admin/media` with per-file progress, cancel and retry.
 *   const queue = useUploadQueue({ onUploaded: (media) => refetch() });
 *   queue.add(fileList);
 * Files failing the client check (type, size) are listed as errors without being sent.
 */
export function useUploadQueue({
  onUploaded,
  onFinished,
}: {
  /** After each successful upload. */
  onUploaded?: (media: MediaItem) => void;
  /** When the queue has no more pending files (with the items processed in this run). */
  onFinished?: (items: UploadItem[]) => void;
} = {}) {
  const [items, rawDispatch] = useReducer(uploadReducer, []);
  // The reducer is pure, so a mirror can be kept for the async upload loop.
  const mirror = useRef<UploadItem[]>([]);
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(false);
  const reported = useRef(new Set<string>());
  const callbacks = useRef({ onUploaded, onFinished });
  useEffect(() => {
    callbacks.current = { onUploaded, onFinished };
  });

  const dispatch = useCallback((action: UploadAction) => {
    mirror.current = uploadReducer(mirror.current, action);
    rawDispatch(action);
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      let next = nextUpload(mirror.current);
      while (next) {
        const { id } = next;
        const file = files.current.get(id);
        if (!file) {
          dispatch({ type: "start", id });
          dispatch({ type: "fail", id, error: "The file is no longer available. Add it again." });
        } else {
          const controller = new AbortController();
          controllers.current.set(id, controller);
          dispatch({ type: "start", id });
          const form = new FormData();
          form.append("file", file, file.name);
          try {
            const media = await adminApi.upload<MediaItem>("/media", form, {
              signal: controller.signal,
              onProgress: ({ fraction }) => dispatch({ type: "progress", id, progress: fraction }),
            });
            dispatch({ type: "success", id, media });
            files.current.delete(id);
            callbacks.current.onUploaded?.(media);
          } catch (err) {
            if (!isAbortError(err)) {
              const status = toAdminApiError(err).status;
              dispatch({
                type: "fail",
                id,
                error: adminErrorMessage(err),
                // The file itself was refused (too large, not an image…): retrying cannot help.
                retryable: ![413, 415, 422].includes(status),
              });
            }
          } finally {
            controllers.current.delete(id);
          }
        }
        next = nextUpload(mirror.current);
      }
    } finally {
      running.current = false;
      // Report every file finished since the last report (including ones rejected up front).
      const fresh = mirror.current.filter(
        (item) =>
          !reported.current.has(item.id) && item.status !== "queued" && item.status !== "uploading",
      );
      fresh.forEach((item) => reported.current.add(item.id));
      if (fresh.length) callbacks.current.onFinished?.(fresh);
    }
  }, [dispatch]);

  const add = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (!incoming.length) return;
      const entries = incoming.map((file) => {
        counter += 1;
        const id = `u${Date.now().toString(36)}${counter}`;
        files.current.set(id, file);
        return { id, name: file.name, size: file.size, error: validateImageFile(file) };
      });
      for (const entry of entries) if (entry.error) files.current.delete(entry.id);
      dispatch({ type: "add", items: entries });
      void pump();
    },
    [dispatch, pump],
  );

  const cancel = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort();
      dispatch({ type: "cancel", id });
    },
    [dispatch],
  );

  const retry = useCallback(
    (id: string) => {
      reported.current.delete(id);
      dispatch({ type: "retry", id });
      void pump();
    },
    [dispatch, pump],
  );

  const dismiss = useCallback(
    (id: string) => {
      files.current.delete(id);
      dispatch({ type: "dismiss", id });
    },
    [dispatch],
  );

  const clearFinished = useCallback(() => {
    for (const item of mirror.current) {
      if (item.status !== "queued" && item.status !== "uploading") files.current.delete(item.id);
    }
    dispatch({ type: "clearFinished" });
  }, [dispatch]);

  // Leaving the page stops running uploads.
  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  return { items, add, cancel, retry, dismiss, clearFinished };
}
