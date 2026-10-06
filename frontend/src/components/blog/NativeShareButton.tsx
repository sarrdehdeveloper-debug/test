"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

const noopSubscribe = () => () => {};
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * "Share…" button for the system share sheet (phones, Safari). Renders nothing where the Web
 * Share API is missing (most desktop browsers) and during server rendering.
 */
export function NativeShareButton({
  title,
  label,
  className,
}: {
  title: string;
  label: string;
  className?: string;
}) {
  const supported = useSyncExternalStore(noopSubscribe, canShare, () => false);
  if (!supported) return null;

  const share = async () => {
    const { origin, pathname, search } = window.location;
    try {
      await navigator.share({ title, url: `${origin}${pathname}${search}` });
    } catch {
      /* dismissed by the visitor, or not allowed: nothing to do */
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-fg transition-colors hover:border-ornament hover:bg-gold-light/10",
        className,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="size-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12.5V3m0 0L6.5 6.5M10 3l3.5 3.5M5 10H4.5A1.5 1.5 0 0 0 3 11.5v4A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-4a1.5 1.5 0 0 0-1.5-1.5H15" />
      </svg>
      {label}
    </button>
  );
}
