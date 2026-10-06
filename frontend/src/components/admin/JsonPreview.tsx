"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";
import { Icon } from "./icons";

export interface JsonPreviewProps {
  /** Any JSON-serialisable value (payment event data, audit `data`, settings…). */
  value: unknown;
  /** Heading of the block (also the toggle label when `collapsible`). */
  label?: string;
  /** Start collapsed behind a toggle (default false). */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Max height before scrolling (Tailwind class, default "max-h-80"). */
  maxHeightClassName?: string;
  className?: string;
}

function stringify(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}

/**
 * Read-only, pretty-printed JSON with a copy button (LTR, monospace, scrolls when long).
 *   <JsonPreview value={event.data} label="Event data" collapsible />
 */
export function JsonPreview({
  value,
  label = "JSON",
  collapsible = false,
  defaultOpen = false,
  maxHeightClassName = "max-h-80",
  className,
}: JsonPreviewProps) {
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const id = useId();
  const text = stringify(value);
  return (
    <div className={cn("min-w-0 rounded-lg border border-stone-200 bg-stone-50", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={id}
            className="-ms-1 inline-flex items-center gap-1 rounded px-1 text-xs font-semibold text-ink-soft hover:text-ink"
          >
            <Icon
              name="chevronRight"
              className={cn("size-3.5 transition-transform", open && "rotate-90")}
            />
            {label}
          </button>
        ) : (
          <span className="text-xs font-semibold text-ink-soft">{label}</span>
        )}
        <CopyButton value={text} label={`Copy ${label}`} />
      </div>
      {open ? (
        <pre
          id={id}
          dir="ltr"
          tabIndex={0}
          className={cn(
            "overflow-auto border-t border-stone-200 px-3 py-2.5 font-mono text-xs leading-relaxed text-ink",
            maxHeightClassName,
          )}
        >
          {text}
        </pre>
      ) : null}
    </div>
  );
}
