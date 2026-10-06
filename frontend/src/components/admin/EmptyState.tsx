import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Icon in the gold medallion (default "sparkle"). */
  icon?: IconName;
  /** Call to action (e.g. "New offer" button). */
  action?: ReactNode;
  /** Tighter spacing for use inside tables and panels. */
  compact?: boolean;
  /** `alert` styles it as an error/denied state (red medallion). */
  tone?: "default" | "alert";
  className?: string;
}

/** Friendly "nothing here yet" block: icon medallion, title, text and an optional action. */
export function EmptyState({
  title,
  description,
  icon = "sparkle",
  action,
  compact = false,
  tone = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full ring-1",
          compact ? "size-10" : "size-14",
          tone === "alert"
            ? "bg-danger-soft text-danger ring-danger/20"
            : "bg-gold-pale/60 text-gold-deep ring-gold/25",
        )}
      >
        <Icon name={icon} className={compact ? "size-5" : "size-6"} />
      </span>
      <p className={cn("font-semibold text-ink", compact ? "mt-3 text-sm" : "mt-4 text-base")}>
        {title}
      </p>
      {description ? (
        <p className={cn("mt-1 max-w-md text-ink-soft", compact ? "text-[0.8125rem]" : "text-sm")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
