import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export type StatusTone = "info" | "success" | "warning" | "error" | "neutral";

const TONES: Record<StatusTone, string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-danger-soft text-danger",
  neutral: "bg-gold-pale text-gold-deep",
};

const ICONS: Record<StatusTone, ReactNode> = {
  info: <path d="M12 11v5m0-8.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  success: <path d="m7.5 12.5 3 3 6-6.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  warning: (
    <path d="M12 8v5m0 3.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  ),
  error: <path d="M12 7.5v6m0 3h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  neutral: <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
};

/**
 * Centered message card for the flow pages (not found, expired, guidance...). The page title is
 * the FlowHero's <h1>; this card carries the explanation and the next steps.
 */
export function StatusCard({
  tone = "neutral",
  children,
  actions,
  footer,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      padding="none"
      className={cn(
        "mx-auto max-w-2xl px-6 py-9 text-center shadow-lift sm:px-12 sm:py-11",
        className,
      )}
    >
      <span className={cn("mx-auto grid size-14 place-items-center rounded-full", TONES[tone])}>
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONS[tone]}
        </svg>
      </span>
      <div className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-fg">{children}</div>
      {actions ? (
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          {actions}
        </div>
      ) : null}
      {footer ? <div className="mt-8 border-t border-line pt-6">{footer}</div> : null}
    </Card>
  );
}
