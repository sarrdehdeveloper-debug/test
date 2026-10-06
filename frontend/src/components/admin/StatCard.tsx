import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";
import { Skeleton } from "./QueryState";

export interface StatCardProps {
  /** Small caption above the value ("Revenue · 7 days"). */
  label: ReactNode;
  /** The figure (already formatted). */
  value: ReactNode;
  /** Secondary line under the value ("12 today"). */
  hint?: ReactNode;
  icon?: IconName;
  /** Whole card links here (e.g. failed jobs → /admin/jobs). */
  href?: string;
  /** `alert` = red accent (e.g. failed jobs > 0), `gold` = highlighted figure. */
  tone?: "default" | "gold" | "alert";
  /** Show a skeleton instead of the value. */
  loading?: boolean;
  className?: string;
}

/**
 * KPI tile for the overview.
 *   <StatCard label="Paid orders · 30 days" value={formatNumber(d.orders.last_30_days)} hint={`${d.orders.today} today`} icon="orders" />
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  tone = "default",
  loading = false,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.8125rem] font-medium text-ink-soft">{label}</p>
        {icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset max-sm:hidden",
              tone === "alert"
                ? "bg-danger-soft text-danger ring-danger/15"
                : "bg-gold-pale/50 text-gold-deep ring-gold/20",
            )}
          >
            <Icon name={icon} className="size-4" />
          </span>
        ) : null}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-8 w-28" />
          <Skeleton className="mt-2 h-3.5 w-20" />
        </>
      ) : (
        <>
          <p
            className={cn(
              "mt-1.5 text-[1.75rem] leading-none font-semibold tracking-tight",
              tone === "alert" ? "text-danger" : tone === "gold" ? "text-gold-deep" : "text-ink",
            )}
          >
            {value}
          </p>
          {hint ? <p className="mt-2 text-xs text-ink-soft">{hint}</p> : null}
        </>
      )}
      {href ? (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gold-deep">
          View
          <Icon
            name="arrowRight"
            className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
          />
        </span>
      ) : null}
    </>
  );
  const classes = cn(
    "group relative block min-w-0 rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgb(31_36_48/0.04)] sm:p-5",
    tone === "alert" ? "border-danger/30" : "border-stone-200",
    href && "transition-[border-color,box-shadow] hover:border-gold/50 hover:shadow-card",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
