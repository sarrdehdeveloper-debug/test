"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/admin/toast";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface CopyButtonProps {
  /** Text put on the clipboard. */
  value: string;
  /** Accessible name / tooltip (default "Copy"). Shown as text when `showLabel`. */
  label?: string;
  showLabel?: boolean;
  className?: string;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path (e.g. insecure origin)
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Small icon button that copies `value` and confirms with a check mark (announced politely).
 *   <span className="font-mono">{order.id}</span> <CopyButton value={order.id} label="Copy order id" />
 */
export function CopyButton({
  value,
  label = "Copy",
  showLabel = false,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        if (await writeClipboard(value)) setCopied(true);
        else toast.error("Couldn't copy to the clipboard. Select the text and copy it manually.");
      }}
      title={copied ? "Copied" : label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-md align-middle text-stone-500 transition-colors hover:bg-stone-100 hover:text-ink",
        showLabel ? "h-7 px-2 text-xs font-medium" : "size-7",
        copied && "text-success hover:text-success",
        className,
      )}
    >
      <Icon name={copied ? "check" : "copy"} className="size-3.5" />
      <span className={showLabel ? undefined : "sr-only"}>{copied ? "Copied" : label}</span>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
