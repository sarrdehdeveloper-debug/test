"use client";

import { useRef, useState, type DragEvent } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { Icon } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { CHECKERBOARD, MediaDetailsDialog } from "@/components/admin/media/MediaDetailsDialog";
import { UploadQueuePanel } from "@/components/admin/media/UploadQueuePanel";
import { useUploadQueue } from "@/components/admin/media/useUploadQueue";
import { MediaImage } from "@/components/ui/MediaImage";
import { formatBytes, formatDate } from "@/lib/admin/format";
import { useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import { toast } from "@/lib/admin/toast";
import { MEDIA_ACCEPT, MEDIA_MAX_BYTES, type AdminPage, type MediaItem } from "@/lib/admin/types";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 24;

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** /admin/media — the image library: drag & drop uploads, details, copy URL, delete. */
export function MediaView() {
  const [params, setParams] = useUrlParams();
  const page = parsePage(params.get("page"));
  const query = useAdminQuery<AdminPage<MediaItem>>("/media", {
    query: { page, page_size: PAGE_SIZE },
  });
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const queue = useUploadQueue({
    onUploaded: () => {
      if (page === 1) void query.refetch();
    },
    onFinished: (items) => {
      const done = items.filter((item) => item.status === "done").length;
      const failed = items.filter((item) => item.status === "error").length;
      // Cancelled-only runs need no message.
      if (done && !failed) {
        toast.success(done === 1 ? "Image uploaded" : `${done} images uploaded`, {
          action:
            page !== 1 ? { label: "Show", onClick: () => setParams({ page: null }) } : undefined,
        });
      } else if (failed) {
        toast.error(
          failed === 1 ? "1 image could not be uploaded" : `${failed} images could not be uploaded`,
          { description: "See the upload list for the reason." },
        );
      }
    },
  });

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    queue.add(event.dataTransfer.files);
  };

  const items = query.data?.items ?? [];

  return (
    <div
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <PageHeader
        title="Media"
        description="Images for offers, blog posts and the library. Uploads are checked and re-saved without camera or location data; an image that is still used cannot be deleted."
        actions={
          <AdminButton variant="primary" icon="upload" onClick={() => fileInput.current?.click()}>
            Upload images
          </AdminButton>
        }
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={MEDIA_ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (event.target.files) queue.add(event.target.files);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className={cn(
          "mb-5 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors",
          dragging
            ? "border-gold-bright bg-gold-pale/50"
            : "border-stone-300 bg-white/60 hover:border-gold/60 hover:bg-white",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-11 items-center justify-center rounded-full ring-1 transition-colors",
            dragging
              ? "bg-gold-bright text-white ring-gold"
              : "bg-gold-pale/60 text-gold-deep ring-gold/25",
          )}
        >
          <Icon name="upload" className="size-5" />
        </span>
        <span className="text-sm font-semibold text-ink">
          {dragging ? "Drop to upload" : "Drag images here, or click to choose files"}
        </span>
        <span className="text-xs text-ink-soft">
          JPEG, PNG, WEBP or GIF · up to {formatBytes(MEDIA_MAX_BYTES)} each · several at once
        </span>
      </button>

      <UploadQueuePanel
        items={queue.items}
        onCancel={queue.cancel}
        onRetry={queue.retry}
        onDismiss={queue.dismiss}
        onClear={queue.clearFinished}
      />

      <Panel
        padding="none"
        title="Library"
        description={
          query.data
            ? `${query.data.total} ${query.data.total === 1 ? "image" : "images"}`
            : undefined
        }
        footer={
          query.data && query.data.total > PAGE_SIZE ? (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={query.data.total}
              onPageChange={(p) => setParams({ page: p > 1 ? p : null })}
              disabled={query.fetching}
              itemLabel="images"
            />
          ) : undefined
        }
      >
        {query.error && !query.data ? (
          <ErrorState error={query.error} onRetry={query.refetch} compact />
        ) : query.loading ? (
          <ul
            className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 sm:p-5 md:grid-cols-4 xl:grid-cols-6"
            aria-hidden="true"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="mt-2 h-3 w-3/4" />
                <Skeleton className="mt-1.5 h-2.5 w-1/2" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            icon="media"
            title="No images yet"
            description="Upload images here, or directly from any image field (offers, blog, library)."
            action={
              <AdminButton icon="upload" size="sm" onClick={() => fileInput.current?.click()}>
                Upload images
              </AdminButton>
            }
          />
        ) : (
          <ul
            className={cn(
              "grid grid-cols-2 gap-4 p-4 transition-opacity sm:grid-cols-3 sm:p-5 md:grid-cols-4 xl:grid-cols-6",
              query.isPlaceholder && "opacity-60",
            )}
            aria-busy={query.fetching || undefined}
          >
            {items.map((media) => (
              <li key={media.id}>
                <button
                  type="button"
                  onClick={() => setSelected(media)}
                  className="group block w-full rounded-lg text-start"
                  aria-label={`Details of ${media.original_name || media.file_name}`}
                >
                  <span
                    className={`relative block aspect-square overflow-hidden rounded-lg border border-stone-200 transition group-hover:border-gold-bright group-hover:ring-2 group-hover:ring-gold-light/60 ${CHECKERBOARD}`}
                  >
                    <MediaImage
                      src={media.url}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 160px, (min-width: 768px) 22vw, 45vw"
                      className="object-cover"
                    />
                  </span>
                  <span
                    className="mt-1.5 block truncate text-xs font-medium text-ink"
                    title={media.original_name}
                  >
                    {media.original_name || media.file_name}
                  </span>
                  <span className="block truncate text-[0.7rem] text-ink-soft">
                    {media.width && media.height ? `${media.width}×${media.height} · ` : ""}
                    {formatBytes(media.size_bytes)} · {formatDate(media.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <MediaDetailsDialog
        media={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null);
          // The last image of a page: go back one page.
          if (items.length === 1 && page > 1) setParams({ page: page - 1 > 1 ? page - 1 : null });
          else void query.refetch();
        }}
      />
    </div>
  );
}
