"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./EmptyState";
import { ErrorState, Skeleton } from "./QueryState";

export interface DataTableColumn<T> {
  /** Stable key of the column. */
  id: string;
  /** Header content. */
  header: ReactNode;
  /** Cell content for a row. */
  cell: (row: T, index: number) => ReactNode;
  /** Text alignment (numbers: "end"). Default "start". */
  align?: "start" | "center" | "end";
  /** Hide on narrow screens (the table also scrolls horizontally when needed). */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /** Visually hide the header (e.g. an actions column) — still read by screen readers. */
  srOnlyHeader?: boolean;
  /** Extra classes for the header and cells (e.g. width: "w-32", "whitespace-nowrap"). */
  className?: string;
  /** Skeleton bar width while loading (Tailwind width class, default "w-24"). */
  skeletonClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  /** Unique key of a row. */
  getRowId: (row: T) => string | number;
  /** Accessible name of the table (visually hidden caption). */
  caption: string;
  /** Show skeleton rows (first load). */
  loading?: boolean;
  /** Dim the rows while a refetch / new page loads. */
  stale?: boolean;
  /** Query error: replaces the body with <ErrorState>. */
  error?: unknown;
  onRetry?: () => void;
  /** Make each row a link: the first column's content is wrapped in <Link>, the whole row is clickable. */
  rowHref?: (row: T) => string | null | undefined;
  /** Alternative to `rowHref` for rows that open something (dialog…). Rows get Enter/Space handling. */
  onRowClick?: (row: T) => void;
  /** Empty state content (default: "Nothing here yet"). */
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  /** Number of skeleton rows (default 5). */
  skeletonRows?: number;
  /** Highlight a row (e.g. the selected one). */
  isRowSelected?: (row: T) => boolean;
  className?: string;
}

const HIDE: Record<NonNullable<DataTableColumn<unknown>["hideBelow"]>, string> = {
  sm: "max-sm:hidden",
  md: "max-md:hidden",
  lg: "max-lg:hidden",
  xl: "max-xl:hidden",
};

const ALIGN = { start: "text-start", center: "text-center", end: "text-end" } as const;

function isInteractive(target: EventTarget | null, currentTarget: Element): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== currentTarget) {
    if (
      node.matches(
        "a, button, input, select, textarea, label, summary, [role='button'], [role='checkbox'], [role='switch']",
      )
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Dense data table with loading skeleton, error and empty states and clickable rows.
 *
 *   <DataTable
 *     caption="Orders"
 *     rows={data?.items}
 *     loading={loading}
 *     stale={isPlaceholder}
 *     error={error}
 *     onRetry={refetch}
 *     getRowId={(o) => o.id}
 *     rowHref={(o) => `/admin/orders/${o.id}`}
 *     columns={[
 *       { id: "email", header: "Customer", cell: (o) => o.email },
 *       { id: "amount", header: "Amount", align: "end", cell: (o) => formatMoney(o.amount_cents, o.currency) },
 *       { id: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
 *     ]}
 *     emptyTitle="No orders yet"
 *   />
 *
 * Render it inside `<Panel padding="none">` and put <Pagination> in the panel footer.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  loading = false,
  stale = false,
  error,
  onRetry,
  rowHref,
  onRowClick,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  skeletonRows = 5,
  isRowSelected,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const showSkeleton = loading && !rows?.length;
  const showError = !showSkeleton && error != null && !rows?.length;
  const showEmpty = !showSkeleton && !showError && (rows?.length ?? 0) === 0;
  const clickable = Boolean(rowHref || onRowClick);

  const activate = (row: T, newTab: boolean) => {
    const href = rowHref?.(row);
    if (href) {
      if (newTab) window.open(href, "_blank", "noopener");
      else router.push(href);
    } else {
      onRowClick?.(row);
    }
  };

  const onClick = (row: T) => (event: MouseEvent<HTMLTableRowElement>) => {
    if (isInteractive(event.target, event.currentTarget)) return;
    if (window.getSelection()?.toString()) return; // the user is selecting text
    activate(row, event.metaKey || event.ctrlKey);
  };

  const onKeyDown = (row: T) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (rowHref || event.target !== event.currentTarget) return; // links handle the keyboard
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm" aria-busy={loading || stale || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50/70">
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  "px-4 py-2.5 text-[0.7rem] font-semibold tracking-wider whitespace-nowrap text-ink-soft uppercase first:ps-4 sm:first:ps-5 last:pe-4 sm:last:pe-5",
                  ALIGN[column.align ?? "start"],
                  column.hideBelow && HIDE[column.hideBelow],
                  column.className,
                )}
              >
                {column.srOnlyHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn("transition-opacity duration-200", stale && "opacity-55")}>
          {showSkeleton
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-stone-100 last:border-0">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "px-4 py-3.5 first:ps-4 sm:first:ps-5 last:pe-4 sm:last:pe-5",
                        column.hideBelow && HIDE[column.hideBelow],
                      )}
                    >
                      <Skeleton
                        className={cn(
                          "h-3.5",
                          column.skeletonClassName ?? "w-24",
                          column.align === "end" && "ms-auto",
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : null}
          {showError ? (
            <tr>
              <td colSpan={columns.length}>
                <ErrorState error={error} onRetry={onRetry} compact />
              </td>
            </tr>
          ) : null}
          {showEmpty ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  compact
                  title={emptyTitle}
                  description={emptyDescription}
                  action={emptyAction}
                />
              </td>
            </tr>
          ) : null}
          {!showSkeleton && !showError
            ? rows?.map((row, index) => {
                const href = rowHref?.(row) ?? undefined;
                const selected = isRowSelected?.(row) ?? false;
                return (
                  <tr
                    key={getRowId(row)}
                    onClick={clickable ? onClick(row) : undefined}
                    onKeyDown={onRowClick && !rowHref ? onKeyDown(row) : undefined}
                    tabIndex={onRowClick && !rowHref ? 0 : undefined}
                    aria-selected={isRowSelected ? selected : undefined}
                    className={cn(
                      "border-b border-stone-100 last:border-0",
                      clickable && "cursor-pointer hover:bg-ivory focus-within:bg-ivory",
                      selected && "bg-gold-pale/40",
                    )}
                  >
                    {columns.map((column, columnIndex) => {
                      const content = column.cell(row, index);
                      return (
                        <td
                          key={column.id}
                          className={cn(
                            "px-4 py-3 align-middle text-ink first:ps-4 sm:first:ps-5 last:pe-4 sm:last:pe-5",
                            ALIGN[column.align ?? "start"],
                            column.hideBelow && HIDE[column.hideBelow],
                            column.className,
                          )}
                        >
                          {columnIndex === 0 && href ? (
                            <Link
                              href={href}
                              className="font-medium text-ink decoration-gold/50 underline-offset-2 hover:underline"
                            >
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            : null}
        </tbody>
      </table>
    </div>
  );
}
