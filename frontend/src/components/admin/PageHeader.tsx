import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Page title (rendered as the page's only h1). */
  title: ReactNode;
  /** One or two sentences under the title. */
  description?: ReactNode;
  /** Buttons on the end side (wrap below the title on small screens). */
  actions?: ReactNode;
  /** Trail above the title, e.g. `[{label: "Orders", href: "/admin/orders"}]`. */
  breadcrumbs?: Breadcrumb[];
  /** Small element next to the title (e.g. a StatusBadge). */
  badge?: ReactNode;
  className?: string;
}

/**
 * Title block at the top of every dashboard page.
 *   <PageHeader title="Orders" description="Paid reports and their delivery." actions={<AdminButton …/>} />
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}
    >
      <div className="min-w-0 flex-1 basis-72">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-[0.8125rem] text-ink-soft">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {crumb.href ? (
                    <Link href={crumb.href} className="rounded hover:text-ink hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                  {index < breadcrumbs.length - 1 ? (
                    <Icon
                      name="chevronRight"
                      className="size-3.5 text-stone-400 rtl:-scale-x-100"
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-serif text-[1.75rem] leading-tight font-semibold text-ink sm:text-[2rem]">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
