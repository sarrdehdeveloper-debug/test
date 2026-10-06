"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

export interface NavLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Match only the exact path (default for "/"). */
  exact?: boolean;
  onClick?: () => void;
}

/** Locale-aware link that sets aria-current="page" when it matches the current route. */
export function NavLink({ href, children, className, exact, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const isExact = exact ?? href === "/";
  const active = isExact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
