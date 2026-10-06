"use client";

import { AdminButton } from "@/components/admin/AdminButton";
import { Icon } from "@/components/admin/icons";
import { formatBytes } from "@/lib/admin/format";
import { cn } from "@/lib/cn";
import { queueStatusText, queueSummary, type UploadItem } from "./uploadQueue";

function ItemStatus({ item }: { item: UploadItem }) {
  const percent = Math.round(item.progress * 100);
  switch (item.status) {
    case "queued":
      return <span className="text-ink-soft">Waiting…</span>;
    case "uploading":
      return (
        <span className="text-ink-soft tabular-nums">
          {percent < 100 ? `Uploading ${percent}%` : "Processing…"}
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-success">
          <Icon name="check" className="size-3.5" />
          Uploaded
        </span>
      );
    case "cancelled":
      return <span className="text-ink-soft">Cancelled</span>;
    default:
      return <span className="font-medium text-danger">{item.error}</span>;
  }
}

/**
 * List of files being uploaded (one after another) with progress bars and cancel / retry /
 * dismiss; the overall status is announced politely.
 */
export function UploadQueuePanel({
  items,
  onCancel,
  onRetry,
  onDismiss,
  onClear,
}: {
  items: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
}) {
  const summary = queueSummary(items);
  if (!items.length) return null;
  return (
    <section
      aria-labelledby="upload-queue-title"
      className="mb-5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgb(31_36_48/0.04)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/80 px-4 py-3 sm:px-5">
        <div>
          <h2 id="upload-queue-title" className="text-[0.95rem] font-semibold text-ink">
            Uploads
          </h2>
          <p className="text-[0.8125rem] text-ink-soft" role="status" aria-live="polite">
            {queueStatusText(items)}
          </p>
        </div>
        {summary.done + summary.failed + summary.cancelled > 0 ? (
          <AdminButton size="sm" variant="ghost" onClick={onClear}>
            Clear finished
          </AdminButton>
        ) : null}
      </header>
      <ul className="divide-y divide-stone-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md",
                item.status === "error"
                  ? "bg-danger-soft text-danger"
                  : item.status === "done"
                    ? "bg-success-soft text-success"
                    : "bg-stone-100 text-stone-500",
              )}
            >
              <Icon
                name={
                  item.status === "error" ? "alert" : item.status === "done" ? "check" : "image"
                }
                className="size-4"
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="truncate text-sm font-medium text-ink" title={item.name}>
                  {item.name}
                </span>
                <span className="text-xs text-ink-soft tabular-nums">{formatBytes(item.size)}</span>
              </div>
              {item.status === "uploading" || item.status === "queued" ? (
                <div
                  role="progressbar"
                  aria-label={`Upload of ${item.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(item.progress * 100)}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100"
                >
                  <div
                    className="h-full rounded-full bg-gold-bright transition-[width] duration-200"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
              ) : null}
              <p className="mt-1 text-xs">
                <ItemStatus item={item} />
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {item.status === "uploading" || item.status === "queued" ? (
                <AdminButton size="xs" variant="ghost" onClick={() => onCancel(item.id)}>
                  Cancel<span className="sr-only"> {item.name}</span>
                </AdminButton>
              ) : null}
              {(item.status === "error" || item.status === "cancelled") && item.retryable ? (
                <AdminButton
                  size="xs"
                  variant="ghost"
                  icon="refresh"
                  onClick={() => onRetry(item.id)}
                >
                  Retry<span className="sr-only"> {item.name}</span>
                </AdminButton>
              ) : null}
              {item.status === "done" || item.status === "error" || item.status === "cancelled" ? (
                <AdminButton
                  size="xs"
                  variant="ghost"
                  icon="close"
                  iconOnly
                  onClick={() => onDismiss(item.id)}
                >
                  {`Dismiss ${item.name}`}
                </AdminButton>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
