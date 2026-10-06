"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  dismissToast,
  getServerToasts,
  getToasts,
  subscribeToasts,
  type Toast,
  type ToastTone,
} from "@/lib/admin/toast";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

const TONE: Record<ToastTone, { icon: IconName; accent: string; iconColor: string }> = {
  success: { icon: "check", accent: "bg-success", iconColor: "text-success bg-success-soft" },
  error: { icon: "alert", accent: "bg-danger", iconColor: "text-danger bg-danger-soft" },
  warning: { icon: "alert", accent: "bg-warning", iconColor: "text-warning bg-warning-soft" },
  info: { icon: "info", accent: "bg-info", iconColor: "text-info bg-info-soft" },
};

function ToastItem({ item }: { item: Toast }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const style = TONE[item.tone];

  useEffect(() => {
    if (!item.duration || paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismissToast(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1000, remaining.current - (Date.now() - started));
    };
  }, [item.id, item.duration, paused]);

  return (
    <li
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-stone-200 bg-white py-3 ps-4 pe-2 text-sm shadow-lift motion-safe:animate-[admin-rise_0.2s_ease-out_both]"
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 start-0 w-1", style.accent)} />
      <span
        className={cn(
          "mt-px flex size-6 shrink-0 items-center justify-center rounded-full",
          style.iconColor,
        )}
      >
        <Icon name={style.icon} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-medium text-ink">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{item.description}</p>
        ) : null}
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismissToast(item.id);
            }}
            className="mt-1.5 text-[0.8125rem] font-semibold text-gold-deep hover:underline"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-ink"
        aria-label="Dismiss notification"
      >
        <Icon name="close" className="size-3.5" />
      </button>
    </li>
  );
}

/**
 * Renders the toast queue (`toast.success(…)` from `@/lib/admin/toast`). Mounted once by
 * AdminShell and the login page. Errors are announced assertively, the rest politely.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  const urgent = toasts.filter((t) => t.tone === "error");
  const polite = toasts.filter((t) => t.tone !== "error");
  // The live regions always exist (empty), so screen readers pick up the first toast too.
  const listClass = "pointer-events-none flex w-full flex-col gap-2";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center p-4 sm:inset-x-auto sm:end-0 sm:w-96 sm:items-end">
      <ol role="status" aria-live="polite" aria-label="Notifications" className={listClass}>
        {polite.map((item) => (
          <ToastItem key={item.id} item={item} />
        ))}
      </ol>
      <ol
        role="alert"
        aria-live="assertive"
        aria-label="Errors"
        className={cn(listClass, polite.length > 0 && urgent.length > 0 && "mt-2")}
      >
        {urgent.map((item) => (
          <ToastItem key={item.id} item={item} />
        ))}
      </ol>
    </div>
  );
}
