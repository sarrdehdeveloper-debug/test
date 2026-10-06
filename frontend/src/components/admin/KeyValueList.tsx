import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface KeyValueItem {
  /** Term (left column). */
  label: ReactNode;
  /** Value; `null`/`undefined`/"" render as an em dash. */
  value: ReactNode;
  /** Render the value in a monospace font (ids, codes, tokens). */
  mono?: boolean;
  /** Hide the row entirely when the value is empty. */
  hideEmpty?: boolean;
  /** Span both columns in the `grid` layout. */
  wide?: boolean;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
  /** `rows` (default): term | value per line; `grid`: 2 columns of stacked pairs from sm up. */
  layout?: "rows" | "grid";
  className?: string;
}

const isEmpty = (value: ReactNode) =>
  value === null || value === undefined || value === "" || value === false;

/**
 * Description list for detail pages (order, user, report…).
 *   <KeyValueList items={[{ label: "Order id", value: order.id, mono: true }, { label: "Paid", value: formatDateTime(order.paid_at) }]} />
 */
export function KeyValueList({ items, layout = "rows", className }: KeyValueListProps) {
  const visible = items.filter((item) => !(item.hideEmpty && isEmpty(item.value)));
  if (layout === "grid") {
    return (
      <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
        {visible.map((item, index) => (
          <div key={index} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
            <dt className="text-xs font-medium text-ink-soft">{item.label}</dt>
            <dd
              className={cn(
                "mt-0.5 text-sm break-words text-ink",
                item.mono && "font-mono text-[0.8125rem]",
              )}
            >
              {isEmpty(item.value) ? <span className="text-stone-400">—</span> : item.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={cn("divide-y divide-stone-100", className)}>
      {visible.map((item, index) => (
        <div
          key={index}
          className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]"
        >
          <dt className="text-[0.8125rem] text-ink-soft">{item.label}</dt>
          <dd
            className={cn(
              "min-w-0 text-sm break-words text-ink",
              item.mono && "font-mono text-[0.8125rem]",
            )}
          >
            {isEmpty(item.value) ? <span className="text-stone-400">—</span> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
