import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  /** Locale-less href; omit for the current page (last crumb). */
  href?: string;
}

/** Breadcrumb trail for the night page header (chevrons mirror in RTL). */
export function Breadcrumbs({
  items,
  label = "Breadcrumb",
  className,
}: {
  items: Crumb[];
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-mist/90">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded-sm underline-offset-4 transition-colors hover:text-gold-light hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="line-clamp-1 max-w-[16rem] text-ivory/90 sm:max-w-md"
                >
                  {item.label}
                </span>
              )}
              {!last ? (
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-gold-light/70 rtl:-scale-x-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m8 5 5 5-5 5" />
                </svg>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
