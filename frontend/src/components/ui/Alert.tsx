import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "error";

const TONES: Record<AlertTone, string> = {
  info: "bg-info-soft text-info border-info/25",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  error: "bg-danger-soft text-danger border-danger/25",
};

const ICONS: Record<AlertTone, ReactNode> = {
  info: <path d="M10 9v5m0-8h.01M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />,
  success: <path d="m6.5 10.5 2.5 2.5 4.5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />,
  warning: (
    <path d="M10 7v4m0 3h.01M8.6 3.3 1.9 15a1.6 1.6 0 0 0 1.4 2.4h13.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" />
  ),
  error: <path d="M10 6v5m0 3h.01M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />,
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Extra content on the end side (e.g. a retry button). */
  action?: ReactNode;
  className?: string;
}

/** Inline message. Errors are announced immediately (role=alert), others politely (role=status). */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        TONES[tone],
        className,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 size-5 shrink-0"
        aria-hidden="true"
      >
        {ICONS[tone]}
      </svg>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5" : "", "text-ink")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
