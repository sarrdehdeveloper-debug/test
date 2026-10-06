"use client";

import { useCallback, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { MediaImage } from "@/components/ui/MediaImage";
import { adminApi, isAbortError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { formatBytes, formatDate } from "@/lib/admin/format";
import { useAdminQuery } from "@/lib/admin/hooks";
import { toast } from "@/lib/admin/toast";
import { MEDIA_ACCEPT, type AdminPage, type MediaItem } from "@/lib/admin/types";
import { validateImageFile, validateImageUrl } from "@/lib/admin/upload";
import { cn } from "@/lib/cn";
import { AdminButton } from "./AdminButton";
import { EmptyState } from "./EmptyState";
import { TextInput } from "./form";
import { Icon } from "./icons";
import { Modal } from "./Modal";
import { Pagination } from "./Pagination";
import { ErrorState, Skeleton } from "./QueryState";

/* ================================================================== upload hook */

export interface ImageUploadState {
  uploading: boolean;
  /** 0..1 while uploading. */
  progress: number;
  error: string | null;
}

/**
 * Upload an image to the media library (`POST /admin/media`, multipart `file`) with progress,
 * client-side validation and readable 413/422 messages.
 *   const { upload, uploading, progress, error } = useImageUpload();
 *   const media = await upload(file); // MediaItem | null
 */
export function useImageUpload() {
  const [state, setState] = useState<ImageUploadState>({
    uploading: false,
    progress: 0,
    error: null,
  });
  const controller = useRef<AbortController | null>(null);

  const upload = useCallback(async (file: File): Promise<MediaItem | null> => {
    const invalid = validateImageFile(file);
    if (invalid) {
      setState({ uploading: false, progress: 0, error: invalid });
      return null;
    }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ uploading: true, progress: 0, error: null });
    const form = new FormData();
    form.append("file", file, file.name);
    try {
      const media = await adminApi.upload<MediaItem>("/media", form, {
        signal: current.signal,
        onProgress: ({ fraction }) => setState((s) => ({ ...s, progress: fraction })),
      });
      setState({ uploading: false, progress: 1, error: null });
      toast.success("Image uploaded", { description: media.original_name || media.file_name });
      return media;
    } catch (err) {
      if (isAbortError(err)) {
        setState({ uploading: false, progress: 0, error: null });
        return null;
      }
      setState({ uploading: false, progress: 0, error: adminErrorMessage(err) });
      return null;
    } finally {
      if (controller.current === current) controller.current = null;
    }
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);
  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);
  return { ...state, upload, cancel, clearError };
}

function UploadProgress({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-200"
      >
        <div
          className="h-full rounded-full bg-gold-bright transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-20 text-xs text-ink-soft tabular-nums" aria-live="polite">
        {percent < 100 ? `Uploading ${percent}%` : "Processing…"}
      </span>
      <AdminButton size="xs" variant="ghost" onClick={onCancel}>
        Cancel
      </AdminButton>
    </div>
  );
}

/* ================================================================== media library dialog */

export interface MediaLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen image (the dialog closes itself). */
  onSelect: (media: MediaItem) => void;
}

const PAGE_SIZE = 24;

/** Modal grid of `GET /admin/media` with paging and an upload button. */
export function MediaLibraryDialog({ open, onClose, onSelect }: MediaLibraryDialogProps) {
  const [page, setPage] = useState(1);
  const query = useAdminQuery<AdminPage<MediaItem>>("/media", {
    query: { page, page_size: PAGE_SIZE },
    enabled: open,
  });
  const uploader = useImageUpload();
  const fileInput = useRef<HTMLInputElement>(null);

  const choose = (media: MediaItem) => {
    onSelect(media);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Media library"
      description="Choose an uploaded image, or upload a new one (JPEG, PNG, WEBP or GIF, up to 5 MB)."
      footer={
        query.data && query.data.total > PAGE_SIZE ? (
          <Pagination
            className="w-full"
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data.total}
            onPageChange={setPage}
            disabled={query.fetching}
            itemLabel="images"
          />
        ) : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminButton
          icon="upload"
          loading={uploader.uploading}
          onClick={() => fileInput.current?.click()}
        >
          Upload new image
        </AdminButton>
        <input
          ref={fileInput}
          type="file"
          accept={MEDIA_ACCEPT.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const media = await uploader.upload(file);
            if (media) choose(media);
          }}
        />
        {uploader.uploading ? (
          <div className="min-w-48 flex-1">
            <UploadProgress progress={uploader.progress} onCancel={uploader.cancel} />
          </div>
        ) : null}
        {uploader.error ? (
          <p role="alert" className="text-sm text-danger">
            {uploader.error}
          </p>
        ) : null}
      </div>

      {query.error && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} compact />
      ) : query.loading ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </li>
          ))}
        </ul>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          compact
          icon="media"
          title="No images yet"
          description="Upload the first image to start the library."
        />
      ) : (
        <ul
          className={cn(
            "grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4",
            query.isPlaceholder && "opacity-60",
          )}
          aria-busy={query.fetching || undefined}
        >
          {query.data?.items.map((media) => (
            <li key={media.id}>
              <button
                type="button"
                onClick={() => choose(media)}
                className="group block w-full rounded-lg text-start"
                aria-label={`Choose ${media.original_name || media.file_name}`}
              >
                <span className="relative block aspect-square overflow-hidden rounded-lg border border-stone-200 bg-stone-100 transition group-hover:border-gold-bright group-hover:ring-2 group-hover:ring-gold-light/60">
                  <MediaImage
                    src={media.url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 200px, 45vw"
                    className="object-cover"
                  />
                </span>
                <span
                  className="mt-1.5 block truncate text-xs font-medium text-ink"
                  title={media.original_name}
                >
                  {media.original_name || media.file_name}
                </span>
                <span className="block text-[0.7rem] text-ink-soft">
                  {media.width && media.height ? `${media.width}×${media.height} · ` : ""}
                  {formatBytes(media.size_bytes)} · {formatDate(media.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ================================================================== picker */

export interface ImagePickerProps {
  /** Current image URL (`/api/v1/media/…` or https), or null. */
  value: string | null;
  onChange: (url: string | null) => void;
  /** Legend of the group (default "Image"). */
  label?: ReactNode;
  hint?: ReactNode;
  /** Validation error from the API (e.g. `fieldErrors.image_url`). */
  error?: ReactNode;
  /** Preview box ratio: `video` 16:9 (default), `square`, `portrait` 3:4 (book covers). */
  aspect?: "video" | "square" | "portrait";
  disabled?: boolean;
  className?: string;
}

const ASPECT = {
  video: "aspect-video w-full sm:w-56",
  square: "aspect-square w-40",
  portrait: "aspect-[3/4] w-36",
} as const;

/**
 * Image field: upload (button or drag & drop, with progress), pick from the media library, or
 * paste a URL; shows a preview and a remove button.
 *   <ImagePicker label="Cover image" value={form.cover_image_url} onChange={(url) => set("cover_image_url", url)} />
 */
export function ImagePicker({
  value,
  onChange,
  label = "Image",
  hint,
  error,
  aspect = "video",
  disabled = false,
  className,
}: ImagePickerProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploader = useImageUpload();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error || uploader.error ? `${id}-error` : undefined;

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    const media = await uploader.upload(file);
    if (media) onChange(media.url);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const applyUrl = () => {
    const problem = validateImageUrl(urlDraft);
    if (problem) {
      setUrlError(problem);
      return;
    }
    onChange(urlDraft.trim());
    setUrlMode(false);
    setUrlDraft("");
    setUrlError(null);
  };

  const showBroken = value !== null && broken === value;

  return (
    <fieldset
      className={cn("min-w-0", className)}
      aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
      disabled={disabled}
    >
      <legend className="mb-1.5 text-sm font-semibold text-fg">{label}</legend>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-lg border bg-stone-50",
            ASPECT[aspect],
            dragging
              ? "border-2 border-dashed border-gold-bright bg-gold-pale/40"
              : "border-stone-200",
            !value && !dragging && "border-dashed border-stone-300",
          )}
        >
          {value && !showBroken ? (
            <MediaImage
              key={value}
              src={value}
              alt="Selected image preview"
              fill
              sizes="224px"
              className="object-cover"
              onError={() => setBroken(value)}
            />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-xs text-ink-soft">
              <Icon
                name={showBroken ? "alert" : "image"}
                className={cn("size-6", showBroken ? "text-warning" : "text-stone-400")}
              />
              {showBroken
                ? "This image could not be loaded"
                : dragging
                  ? "Drop to upload"
                  : "No image · drop a file here"}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <AdminButton
              size="sm"
              icon="upload"
              loading={uploader.uploading}
              onClick={() => fileInput.current?.click()}
            >
              Upload
            </AdminButton>
            <AdminButton size="sm" icon="media" onClick={() => setLibraryOpen(true)}>
              Media library
            </AdminButton>
            <AdminButton
              size="sm"
              icon="link"
              aria-expanded={urlMode}
              onClick={() => {
                setUrlMode((v) => !v);
                setUrlError(null);
              }}
            >
              Paste URL
            </AdminButton>
            {value ? (
              <AdminButton
                size="sm"
                variant="dangerGhost"
                icon="trash"
                onClick={() => onChange(null)}
              >
                Remove
              </AdminButton>
            ) : null}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={MEDIA_ACCEPT.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void handleFile(file);
            }}
          />

          {uploader.uploading ? (
            <UploadProgress progress={uploader.progress} onCancel={uploader.cancel} />
          ) : null}

          {urlMode ? (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <label htmlFor={`${id}-url`} className="sr-only">
                  Image URL
                </label>
                <TextInput
                  id={`${id}-url`}
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyUrl();
                    }
                    if (event.key === "Escape") setUrlMode(false);
                  }}
                  placeholder="https://… or /api/v1/media/…"
                  dir="ltr"
                  inputMode="url"
                  autoComplete="off"
                  aria-invalid={urlError ? true : undefined}
                  aria-describedby={urlError ? `${id}-url-error` : undefined}
                  className="h-8"
                />
                <AdminButton size="sm" variant="primary" onClick={applyUrl}>
                  Use URL
                </AdminButton>
              </div>
              {urlError ? (
                <p id={`${id}-url-error`} className="text-xs text-danger">
                  {urlError}
                </p>
              ) : null}
            </div>
          ) : null}

          {value ? (
            <p className="flex min-w-0 items-center gap-1 text-xs text-ink-soft">
              <span className="truncate font-mono" dir="ltr" title={value}>
                {value}
              </span>
            </p>
          ) : null}
          {hint ? (
            <p id={hintId} className="text-xs text-ink-soft">
              {hint}
            </p>
          ) : null}
          {error || uploader.error ? (
            <p id={errorId} role="alert" className="text-sm font-medium text-danger">
              {uploader.error ?? error}
            </p>
          ) : null}
        </div>
      </div>

      <MediaLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(media) => {
          uploader.clearError();
          onChange(media.url);
        }}
      />
    </fieldset>
  );
}
