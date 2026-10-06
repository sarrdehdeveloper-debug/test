"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/admin/CopyButton";
import { Icon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";

export interface ErrorTextProps {
  /** Error text (may be a multi-line traceback). */
  text: string;
  /** Short label before the first line (default "Error"). */
  label?: string;
  /** Start expanded. */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Red, collapsible error block for `last_error` fields: shows the first line, "Show full error"
 * expands the whole (monospace, scrollable) text with a copy button.
 */
export function ErrorText({
  text,
  label = "Error",
  defaultOpen = false,
  className,
}: ErrorTextProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n", 1)[0];
  const expandable = trimmed.length > firstLine.length || firstLine.length > 140;

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-danger/20 bg-danger-soft/60 text-[0.8125rem] text-danger",
        className,
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        <p className={cn("min-w-0 flex-1 break-words", !open && "line-clamp-2")}>
          <span className="font-semibold">{label}: </span>
          {open ? null : firstLine}
        </p>
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={id}
            className="-my-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-danger underline-offset-2 hover:underline"
          >
            {open ? "Hide" : "Show full error"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={id} className="relative border-t border-danger/15">
          <pre
            dir="ltr"
            tabIndex={0}
            className="max-h-72 overflow-auto px-3 py-2.5 pe-10 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink"
          >
            {trimmed}
          </pre>
          <CopyButton
            value={trimmed}
            label="Copy error"
            className="absolute end-1.5 top-1.5 bg-white/70"
          />
        </div>
      ) : null}
    </div>
  );
}
