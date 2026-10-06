import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PanelProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  /** Heading of the panel (h2). */
  title?: ReactNode;
  /** Small text under the title. */
  description?: ReactNode;
  /** Controls on the end side of the header (buttons, links). */
  actions?: ReactNode;
  /** Footer row (e.g. pagination or form buttons). */
  footer?: ReactNode;
  /** `none` for edge-to-edge content such as tables. Default `md`. */
  padding?: "none" | "sm" | "md";
  /** Heading level of `title` (default 2). */
  headingLevel?: 2 | 3;
}

const PADDING = { none: "", sm: "p-4", md: "p-4 sm:p-5" } as const;

/**
 * White surface card of the dashboard (hairline border, soft shadow) with an optional header.
 *   <Panel title="Recent orders" actions={<AdminButtonLink href="/admin/orders">View all</AdminButtonLink>} padding="none">
 *     <DataTable … />
 *   </Panel>
 */
export function Panel({
  title,
  description,
  actions,
  footer,
  padding = "md",
  headingLevel = 2,
  className,
  children,
  ...props
}: PanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgb(31_36_48/0.04)]",
        className,
      )}
      {...props}
    >
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-stone-200/80 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title ? (
              <Heading className="text-[0.95rem] font-semibold text-ink">{title}</Heading>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className={PADDING[padding]}>{children}</div>
      {footer ? (
        <footer className="border-t border-stone-200/80 px-4 py-3 sm:px-5">{footer}</footer>
      ) : null}
    </section>
  );
}
