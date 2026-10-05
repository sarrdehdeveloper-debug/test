"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const EVENT = "zb:offer-dismissed";
const storageKey = (id: number | string) => `zb_offer_dismissed_${id}`;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function isDismissed(id: number | string): boolean {
  try {
    return window.localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

/** Wraps a server-rendered offer and hides it once the visitor dismissed it (remembered per offer). */
export function DismissibleOffer({
  offerId,
  dismissLabel,
  className,
  buttonClassName,
  children,
}: {
  offerId: number | string;
  dismissLabel: string;
  className?: string;
  buttonClassName?: string;
  children: ReactNode;
}) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => isDismissed(offerId),
    () => false,
  );
  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey(offerId), "1");
    } catch {
      /* storage unavailable: hide for this page view only */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className={cn("relative", className)}>
      {children}
      <button
        type="button"
        onClick={dismiss}
        className={cn(
          "absolute grid size-9 place-items-center rounded-full text-ivory/70 transition-colors hover:bg-white/10 hover:text-gold-light",
          buttonClassName ?? "top-2 end-2",
        )}
      >
        <span className="sr-only">{dismissLabel}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="m5 5 10 10M15 5 5 15" />
        </svg>
      </button>
    </div>
  );
}

/** Discount code chip with a copy-to-clipboard button. */
export function CopyCode({
  code,
  copyLabel,
  copiedLabel,
  className,
}: {
  code: string;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the code stays visible and selectable */
    }
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-gold-light/60 bg-white/5 ps-3.5 pe-1 py-1",
        className,
      )}
    >
      <code lang="en" dir="ltr" className="font-display text-sm font-semibold tracking-[0.14em] text-gold-light select-all">
        {code}
      </code>
      <button
        type="button"
        onClick={copy}
        className="grid size-7 place-items-center rounded-full text-gold-light transition-colors hover:bg-white/10"
      >
        <span className="sr-only">{copyLabel}</span>
        {copied ? (
          <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4.5 10.5 3.5 3.5 7.5-8" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
            <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
            <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6.5A1.5 1.5 0 0 0 5.5 13H7" />
          </svg>
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </span>
  );
}
