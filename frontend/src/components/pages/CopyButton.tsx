"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Copy text to the clipboard. Uses the async Clipboard API and falls back to a hidden textarea +
 * execCommand (older browsers, non-secure origins). Resolves to false when both fail.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission denied or unavailable: try the fallback */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
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

/** The current page URL without the hash (for "copy link"). */
function currentUrl(): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

export interface CopyButtonProps {
  /** Text to copy. Omit to copy the current page URL. */
  value?: string;
  /** Accessible name (and visible text with `showLabel`), e.g. "Copy code WELCOME10". */
  label: string;
  /** Announced (and shown with `showLabel`) after a successful copy. */
  copiedLabel: string;
  /** Announced when copying failed. */
  failedLabel: string;
  /** "icon": round icon button; "pill": outlined button with visible text. */
  variant?: "icon" | "pill";
  className?: string;
}

type Status = "idle" | "copied" | "failed";

/**
 * Copy-to-clipboard button with a polite live region, so screen-reader users hear the result.
 * Tone-aware colours: works on ivory, parchment and night surfaces.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  variant = "icon",
  className,
}: CopyButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async () => {
    const ok = await copyToClipboard(value ?? currentUrl());
    setStatus(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), ok ? 2200 : 5000);
  };

  const icon =
    status === "copied" ? (
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="size-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4.5 10.5 3.5 3.5 7.5-8" />
      </svg>
    ) : variant === "pill" && value === undefined ? (
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
        <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1" />
        <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" />
      </svg>
    ) : (
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="size-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
        <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6.5A1.5 1.5 0 0 0 5.5 13H7" />
      </svg>
    );

  const message = status === "copied" ? copiedLabel : status === "failed" ? failedLabel : "";

  return (
    <>
      {variant === "pill" ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-fg transition-colors hover:border-ornament hover:bg-gold-light/10",
            status === "copied" && "border-ornament text-accent",
            className,
          )}
        >
          {icon}
          {/* Both labels share one grid cell, so the button keeps its width (no layout shift). */}
          <span className="grid">
            <span
              className={cn("[grid-area:1/1]", status === "copied" && "invisible")}
              aria-hidden={status === "copied" || undefined}
            >
              {label}
            </span>
            <span
              className={cn("[grid-area:1/1]", status !== "copied" && "invisible")}
              aria-hidden="true"
            >
              {copiedLabel}
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          title={label}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-accent transition-colors hover:bg-gold-light/15",
            className,
          )}
        >
          <span className="sr-only">{label}</span>
          {icon}
        </button>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  );
}
