"use client";

import type { ReactNode } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { Icon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";
import { PUBLIC_REFRESH_NOTE } from "./publicRefresh";

export interface SaveBarProps {
  /** There are unsaved edits. */
  dirty: boolean;
  /** A save is running. */
  saving?: boolean;
  /** Status text while dirty (default "Unsaved changes"). */
  status?: ReactNode;
  /** Secondary line (default: when the public site shows the change). */
  note?: ReactNode;
  /** Text while clean (default "All changes saved"). */
  cleanStatus?: ReactNode;
  /** Submit the form with this id (preferred: Enter in inputs also saves) … */
  formId?: string;
  /** … or call this. */
  onSave?: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  /** Block saving (e.g. client-side errors) without hiding the button. */
  saveDisabled?: boolean;
  /** Extra controls before the buttons. */
  extra?: ReactNode;
  className?: string;
}

/**
 * Floating bar at the bottom of an editor page (sticky, always rendered so nothing jumps): shows
 * whether there are unsaved edits, the public-refresh note, Discard and Save. Status changes are
 * announced politely.
 *   <SaveBar dirty={dirty} saving={save.pending} formId="offer-form" onDiscard={reset} status="2 unsaved changes" />
 */
export function SaveBar({
  dirty,
  saving = false,
  status,
  note = PUBLIC_REFRESH_NOTE,
  cleanStatus = "All changes saved",
  formId,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  saveDisabled = false,
  extra,
  className,
}: SaveBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-2 z-20 mt-6 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 shadow-[0_10px_30px_-12px_rgb(14_23_38/0.35)] backdrop-blur-sm transition-colors sm:bottom-4 sm:gap-4 sm:px-5 sm:py-3",
        dirty ? "border-gold/40 bg-white/95" : "border-stone-200 bg-white/90",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5" aria-live="polite">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
            dirty ? "bg-gold-pale text-gold-deep" : "bg-success-soft text-success",
          )}
        >
          {dirty ? (
            <span className="size-2 rounded-full bg-gold-bright" />
          ) : (
            <Icon name="check" className="size-3.5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink max-sm:truncate">
            {saving ? "Saving…" : dirty ? (status ?? "Unsaved changes") : cleanStatus}
          </span>
          {note ? <span className="block text-xs text-ink-soft max-sm:hidden">{note}</span> : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {extra}
        {onDiscard ? (
          <AdminButton variant="ghost" size="sm" onClick={onDiscard} disabled={!dirty || saving}>
            Discard
          </AdminButton>
        ) : null}
        <AdminButton
          variant="primary"
          size="sm"
          type={formId ? "submit" : "button"}
          form={formId}
          onClick={formId ? undefined : onSave}
          loading={saving}
          disabled={!dirty || saveDisabled}
          className="sm:min-w-28"
        >
          {saveLabel}
        </AdminButton>
      </div>
    </div>
  );
}
