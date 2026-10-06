"use client";

import { pageBounds, paginationRange, totalPages } from "@/lib/admin/pagination";
import { formatNumber } from "@/lib/admin/format";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface PaginationProps {
  /** Current page (1-based). */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Disable the controls (e.g. while loading). */
  disabled?: boolean;
  /** Noun for the summary ("orders"). Default "items". */
  itemLabel?: string;
  className?: string;
}

const BUTTON =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[0.8125rem] font-medium text-ink-soft " +
  "transition-colors hover:bg-stone-100 hover:text-ink disabled:pointer-events-none disabled:opacity-40";

/**
 * "Showing 21–40 of 132 orders" + previous/next and page numbers (hidden on phones).
 * Renders nothing but the summary when everything fits on one page.
 *   <Pagination page={page} pageSize={data.page_size} total={data.total} onPageChange={(p) => setParams({ page: p })} />
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
  itemLabel = "items",
  className,
}: PaginationProps) {
  const pages = totalPages(total, pageSize);
  const [from, to] = pageBounds(page, pageSize, total);
  const range = paginationRange(page, pages);
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-[0.8125rem] text-ink-soft" aria-live="polite">
        {total === 0 ? (
          `No ${itemLabel}`
        ) : (
          <>
            Showing <span className="font-medium text-ink tabular-nums">{formatNumber(from)}</span>–
            <span className="font-medium text-ink tabular-nums">{formatNumber(to)}</span> of{" "}
            <span className="font-medium text-ink tabular-nums">{formatNumber(total)}</span>{" "}
            {itemLabel}
          </>
        )}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={BUTTON}
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
            aria-label="Previous page"
          >
            <Icon name="chevronLeft" className="size-4 rtl:-scale-x-100" />
            <span className="ms-0.5 max-sm:sr-only">Previous</span>
          </button>
          <ul className="flex items-center gap-0.5 max-sm:hidden">
            {range.map((item, index) =>
              item === "…" ? (
                <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-stone-400">
                  …
                </li>
              ) : (
                <li key={item}>
                  <button
                    type="button"
                    className={cn(
                      BUTTON,
                      "tabular-nums",
                      item === page && "bg-night text-ivory hover:bg-night hover:text-ivory",
                    )}
                    onClick={() => onPageChange(item)}
                    disabled={disabled && item !== page}
                    aria-current={item === page ? "page" : undefined}
                    aria-label={`Page ${item}`}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
          </ul>
          <span className="px-1 text-[0.8125rem] text-ink-soft tabular-nums sm:hidden">
            {page} / {pages}
          </span>
          <button
            type="button"
            className={BUTTON}
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= pages}
            aria-label="Next page"
          >
            <span className="me-0.5 max-sm:sr-only">Next</span>
            <Icon name="chevronRight" className="size-4 rtl:-scale-x-100" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
