import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** "← All offers" style link back to a list page (arrow mirrors in RTL). */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline",
        className,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="size-4 shrink-0 rtl:-scale-x-100"
      >
        <path
          d="M16 10H5m4-4.5L4.5 10 9 14.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </Link>
  );
}
