"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { Icon } from "@/components/admin/icons";
import { KeyValueList } from "@/components/admin/KeyValueList";
import { Modal } from "@/components/admin/Modal";
import { MediaImage } from "@/components/ui/MediaImage";
import { adminApi } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { formatBytes, formatDateTime } from "@/lib/admin/format";
import { useAdminMutation } from "@/lib/admin/hooks";
import type { DeleteOut, MediaItem } from "@/lib/admin/types";
import {
  absoluteMediaUrl,
  dimensionsLabel,
  mediaReferences,
  referenceLink,
  type MediaReference,
} from "./uploadQueue";

export const CHECKERBOARD =
  "bg-white [background-image:repeating-conic-gradient(#f2efe9_0%_25%,#ffffff_0%_50%)] [background-size:18px_18px]";

function DetailsBody({
  media,
  onClose,
  onDeleted,
  onPendingChange,
}: {
  media: MediaItem;
  onClose: () => void;
  onDeleted: (media: MediaItem) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [references, setReferences] = useState<MediaReference[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const absolute =
    typeof window === "undefined" ? media.url : absoluteMediaUrl(media.url, window.location.origin);

  const remove = useAdminMutation(() => adminApi.delete<DeleteOut>(`/media/${media.id}`), {
    errorMessage: false, // shown in the dialog
    successMessage: "Image deleted",
    onSuccess: () => {
      onPendingChange(false);
      onDeleted(media);
    },
    onError: (err) => {
      onPendingChange(false);
      setConfirming(false);
      if (err.code === "media_in_use") {
        setReferences(mediaReferences(err.details));
        setError(null);
      } else {
        setError(adminErrorMessage(err));
      }
    },
  });

  return (
    <>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div
          className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-stone-200 ${CHECKERBOARD}`}
        >
          <MediaImage
            src={media.url}
            alt={media.original_name || "Uploaded image"}
            fill
            sizes="(min-width: 768px) 480px, 90vw"
            className="object-contain"
          />
        </div>
        <div className="min-w-0 space-y-4">
          <KeyValueList
            layout="grid"
            items={[
              { label: "File name", value: media.original_name || "—", wide: true },
              { label: "Dimensions", value: dimensionsLabel(media.width, media.height) },
              { label: "Size", value: formatBytes(media.size_bytes) },
              { label: "Type", value: media.content_type },
              { label: "Uploaded", value: formatDateTime(media.created_at) },
              {
                label: "Address",
                wide: true,
                value: (
                  <span className="flex min-w-0 items-center gap-1">
                    <span
                      className="truncate font-mono text-[0.8125rem]"
                      dir="ltr"
                      title={media.url}
                    >
                      {media.url}
                    </span>
                    <CopyButton value={media.url} label="Copy site path" />
                  </span>
                ),
              },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton
              value={absolute}
              label="Copy full URL"
              showLabel
              className="border border-stone-300 bg-white"
            />
            <AdminButtonLink href={media.url} external size="sm" icon="external">
              Open image
            </AdminButtonLink>
          </div>
          <p className="text-xs text-ink-soft">
            Paste the site path into “Paste URL” of any image field, or pick the image from the
            media library there.
          </p>
        </div>
      </div>

      {references ? (
        <div role="alert" className="mt-5 rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink">
          <p className="flex items-center gap-2 font-medium text-warning">
            <Icon name="alert" className="size-4" />
            This image is still in use, so it cannot be deleted.
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink-soft">
            Remove it from {references.length === 1 ? "this item" : "these items"} first:
          </p>
          <ul className="mt-2 space-y-1">
            {references.map((ref) => {
              const link = referenceLink(ref);
              return (
                <li key={`${ref.entity_type}-${ref.id}`} className="flex items-center gap-2">
                  <Icon name="arrowRight" className="size-3.5 text-stone-500" />
                  {link.href ? (
                    <Link
                      href={link.href}
                      className="font-medium text-ink underline-offset-2 hover:underline"
                      onClick={onClose}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <span>{link.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200/80 bg-stone-50 px-5 py-3">
        {confirming ? (
          <>
            <p className="text-sm font-medium text-danger" role="alert">
              Delete this image permanently?
            </p>
            <div className="flex gap-2">
              <AdminButton size="sm" onClick={() => setConfirming(false)} disabled={remove.pending}>
                Keep it
              </AdminButton>
              <AdminButton
                size="sm"
                variant="danger"
                loading={remove.pending}
                onClick={() => {
                  onPendingChange(true);
                  void remove.mutate();
                }}
              >
                Delete image
              </AdminButton>
            </div>
          </>
        ) : (
          <>
            <AdminButton
              size="sm"
              variant="dangerGhost"
              icon="trash"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Delete
            </AdminButton>
            <AdminButton size="sm" onClick={onClose}>
              Close
            </AdminButton>
          </>
        )}
      </div>
    </>
  );
}

/** Image details: large preview, metadata, copyable URL, and delete (with "still used by" list). */
export function MediaDetailsDialog({
  media,
  onClose,
  onDeleted,
}: {
  media: MediaItem | null;
  onClose: () => void;
  onDeleted: (media: MediaItem) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Modal
      open={media !== null}
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissible={!pending}
      size="xl"
      title={media?.original_name || media?.file_name || "Image"}
      description={
        media
          ? `${dimensionsLabel(media.width, media.height)} · ${formatBytes(media.size_bytes)}`
          : undefined
      }
    >
      {media ? (
        <DetailsBody
          key={media.id}
          media={media}
          onClose={onClose}
          onDeleted={onDeleted}
          onPendingChange={setPending}
        />
      ) : null}
    </Modal>
  );
}
