import type { ReactNode } from "react";
import { humanize } from "@/lib/admin/format";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "gold" | "navy";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-300/70",
  info: "bg-info-soft text-info ring-info/20",
  success: "bg-success-soft text-success ring-success/25",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
  gold: "bg-gold-pale/70 text-gold-deep ring-gold/30",
  navy: "bg-night text-gold-light ring-night",
};

const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-stone-400",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  gold: "bg-gold-bright",
  navy: "bg-gold-light",
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Leading dot; `pulse` animates it (in-progress states). */
  dot?: boolean | "pulse";
  className?: string;
  title?: string;
  children: ReactNode;
}

/** Small rounded label. Prefer <StatusBadge> for API statuses. */
export function Badge({ tone = "neutral", dot = false, className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className="relative flex size-1.5">
          {dot === "pulse" ? (
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                DOTS[tone],
              )}
            />
          ) : null}
          <span className={cn("relative inline-flex size-1.5 rounded-full", DOTS[tone])} />
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export type StatusKind = "order" | "job" | "post" | "prompt" | "section" | "active" | "live";

interface StatusStyle {
  tone: BadgeTone;
  label?: string;
  pulse?: boolean;
}

/** Tone + label for every status the API returns. Exported for tests and custom renderers. */
export const STATUS_STYLES: Record<StatusKind, Record<string, StatusStyle>> = {
  order: {
    awaiting_payment: { tone: "neutral", label: "Awaiting payment" },
    paid: { tone: "info" },
    queued: { tone: "info" },
    generating: { tone: "info", pulse: true },
    ready: { tone: "success" },
    generation_failed: { tone: "danger" },
    expired: { tone: "neutral" },
    abandoned: { tone: "neutral" },
    refunded: { tone: "warning" },
  },
  job: {
    pending: { tone: "neutral" },
    running: { tone: "info", pulse: true },
    done: { tone: "success" },
    failed: { tone: "danger" },
  },
  section: {
    pending: { tone: "neutral" },
    done: { tone: "success" },
    failed: { tone: "danger" },
  },
  post: {
    draft: { tone: "neutral" },
    published: { tone: "success" },
    scheduled: { tone: "gold" },
  },
  prompt: {
    draft: { tone: "warning" },
    published: { tone: "success" },
    archived: { tone: "neutral" },
  },
  active: {
    true: { tone: "success", label: "Active" },
    false: { tone: "neutral", label: "Inactive" },
  },
  live: {
    true: { tone: "success", label: "Live" },
    false: { tone: "neutral", label: "Not live" },
  },
};

export function statusStyle(
  kind: StatusKind,
  status: string,
): Required<Omit<StatusStyle, "pulse">> & { pulse: boolean } {
  const style = STATUS_STYLES[kind]?.[status];
  return {
    tone: style?.tone ?? "neutral",
    label: style?.label ?? humanize(status),
    pulse: style?.pulse ?? false,
  };
}

export interface StatusBadgeProps {
  /** API status (`"generation_failed"`), or a boolean for kind `active` / `live`. */
  status: string | boolean;
  /** Which status family (default `order`). Published/draft = `post`; booleans = `active` / `live`. */
  kind?: StatusKind;
  /** Override the label. */
  label?: ReactNode;
  className?: string;
}

/**
 * Coloured status pill: `<StatusBadge status={order.status} />`, `<StatusBadge kind="job" status="failed" />`,
 * `<StatusBadge kind="post" status={post.status} />`, `<StatusBadge kind="active" status={offer.is_active} />`.
 */
export function StatusBadge({ status, kind = "order", label, className }: StatusBadgeProps) {
  const style = statusStyle(kind, String(status));
  return (
    <Badge tone={style.tone} dot={style.pulse ? "pulse" : true} className={className}>
      {label ?? style.label}
    </Badge>
  );
}
