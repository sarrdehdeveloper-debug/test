import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DetailItem {
  label: ReactNode;
  /** `null` / `undefined` / "" render as an em dash. */
  value: ReactNode;
  mono?: boolean;
  /** Drop the row when the value is empty. */
  hideEmpty?: boolean;
}

const empty = (value: ReactNode) => value === null || value === undefined || value === "";

/**
 * Compact "label … value" rows for narrow side panels (the value is end-aligned and wraps under
 * itself), where KeyValueList's fixed label column would squeeze the values.
 */
export function DetailList({ items, className }: { items: DetailItem[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-stone-100", className)}>
      {items
        .filter((item) => !(item.hideEmpty && empty(item.value)))
        .map((item, index) => (
          <div
            key={index}
            className="flex items-baseline justify-between gap-x-4 py-2 first:pt-0 last:pb-0"
          >
            <dt className="shrink-0 text-[0.8125rem] text-ink-soft">{item.label}</dt>
            <dd
              className={cn(
                "min-w-0 text-end text-sm break-words text-ink",
                item.mono && "font-mono text-[0.8125rem]",
              )}
            >
              {empty(item.value) ? <span className="text-stone-400">—</span> : item.value}
            </dd>
          </div>
        ))}
    </dl>
  );
}
