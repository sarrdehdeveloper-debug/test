"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { initials } from "@/lib/admin/format";
import { activeNavItem, ADMIN_NAV, isNavActive, requiredAccess, visibleNav } from "@/lib/admin/nav";
import { hasRole, ROLE_LABELS } from "@/lib/admin/roles";
import type { AdminUser } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { useAdminAuth } from "./AdminAuthProvider";
import { AdminLogo } from "./AdminLogo";
import { Icon } from "./icons";
import { ErrorState, ForbiddenState, Skeleton } from "./QueryState";
import { Badge } from "./StatusBadge";
import { Toaster } from "./Toaster";

/* ================================================================== sidebar */

function SidebarNav({
  user,
  pathname,
  onNavigate,
}: {
  user: AdminUser | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  const sections = user ? visibleNav(user.role) : null;
  return (
    <div className="flex h-full flex-col bg-night bg-[radial-gradient(ellipse_120%_40%_at_0%_0%,rgb(199_137_51/0.14),transparent_60%)] text-mist">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="rounded-md"
          aria-label="Zodiac Blend admin home"
        >
          <AdminLogo />
        </Link>
      </div>
      <div aria-hidden="true" className="rule-gold mx-5 opacity-40" />
      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-4">
        {sections ? (
          sections.map((section) => (
            <div key={section.id} className="mb-5 last:mb-0">
              {section.label ? (
                <p className="mb-1.5 px-3 font-display text-[0.62rem] font-semibold tracking-[0.24em] text-gold-light/60 uppercase">
                  {section.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isNavActive(pathname, item.href, item.exact);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          "[--tone-focus:var(--color-gold-light)]",
                          active
                            ? "bg-white/[0.08] font-medium text-gold-light"
                            : "text-mist/85 hover:bg-white/[0.05] hover:text-ivory",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-gold-bright transition-opacity",
                            active ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <Icon
                          name={item.icon}
                          className={cn(
                            "size-[1.1rem]",
                            active ? "text-gold-light" : "text-mist/60 group-hover:text-mist",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <div className="space-y-3 px-3" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="block h-4 animate-pulse rounded bg-white/[0.07]"
                style={{ width: `${60 + ((i * 17) % 35)}%` }}
              />
            ))}
          </div>
        )}
      </nav>
      <div className="shrink-0 border-t border-white/[0.08] px-3 py-3">
        <a
          href="/en"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-mist/80 transition-colors [--tone-focus:var(--color-gold-light)] hover:bg-white/[0.05] hover:text-ivory"
        >
          <Icon name="external" className="size-[1.1rem] text-mist/60" />
          View public site
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}

/** Off-canvas sidebar for small screens, on the native <dialog> (focus trap, Esc, inert page). */
function MobileNav({
  open,
  onClose,
  user,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  user: AdminUser | null;
  pathname: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id="admin-mobile-nav"
      aria-label="Dashboard menu"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-[min(18rem,85vw)] max-w-none bg-transparent p-0 backdrop:bg-night/60 backdrop:backdrop-blur-[2px] open:block lg:hidden"
    >
      <div className="relative h-full shadow-2xl">
        <SidebarNav user={user} pathname={pathname} onNavigate={onClose} />
        <button
          type="button"
          onClick={onClose}
          className="absolute end-3 top-4 flex size-8 items-center justify-center rounded-md text-mist [--tone-focus:var(--color-gold-light)] hover:bg-white/10 hover:text-ivory"
          aria-label="Close menu"
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
    </dialog>
  );
}

/* ================================================================== top bar */

function UserMenu({ user, onLogout }: { user: AdminUser; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full py-1 ps-1 pe-2 transition-colors hover:bg-stone-100 sm:rounded-lg sm:pe-2.5"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-gold-soft-gradient font-display text-xs font-bold tracking-wide text-night shadow-sm"
        >
          {initials(user.name || user.email)}
        </span>
        <span className="hidden min-w-0 text-start leading-tight sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-ink">
            {user.name || user.email}
          </span>
          <span className="block text-[0.7rem] text-ink-soft">{ROLE_LABELS[user.role]}</span>
        </span>
        <span className="sr-only">Account menu for {user.name || user.email}</span>
        <Icon
          name="chevronDown"
          className={cn("size-4 text-stone-500 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          id={menuId}
          className="absolute end-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lift motion-safe:animate-[admin-rise_0.15s_ease-out_both]"
        >
          <div className="border-b border-stone-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-soft" dir="ltr">
              {user.email}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="gold">{ROLE_LABELS[user.role]}</Badge>
              <Badge tone={user.mfa_enabled ? "success" : "warning"}>
                {user.mfa_enabled ? "2FA on" : "2FA off"}
              </Badge>
            </div>
          </div>
          <ul className="p-1.5">
            <li>
              <Link
                href="/admin/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-stone-100"
              >
                <Icon name="account" className="size-4 text-stone-500" />
                Account &amp; security
              </Link>
            </li>
            <li>
              <button
                type="button"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await onLogout();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-ink hover:bg-stone-100 disabled:opacity-60"
              >
                <Icon name="logout" className="size-4 text-stone-500 rtl:-scale-x-100" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TopBar({
  user,
  pathname,
  onMenu,
}: {
  user: AdminUser | null;
  pathname: string;
  onMenu: () => void;
}) {
  const { logout } = useAdminAuth();
  const item = activeNavItem(pathname);
  const section = item ? ADMIN_NAV.find((s) => s.items.includes(item)) : null;
  const title = pathname.startsWith("/admin/account") ? "Account" : item?.label;
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/75 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-controls="admin-mobile-nav"
        className="-ms-1.5 flex size-9 items-center justify-center rounded-lg text-ink hover:bg-stone-100 lg:hidden"
      >
        <Icon name="menu" className="size-5" />
        <span className="sr-only">Open menu</span>
      </button>
      <Link href="/admin" className="rounded-md lg:hidden" aria-label="Zodiac Blend admin home">
        <span className="flex size-8 items-center justify-center rounded-lg bg-night">
          <Image src="/brand/emblem-128.png" alt="" width={56} height={56} className="size-7" />
        </span>
      </Link>
      <p className="min-w-0 truncate text-sm text-ink-soft">
        {section?.label ? <span className="max-sm:hidden">{section.label} / </span> : null}
        <span className="font-medium text-ink">{title ?? "Dashboard"}</span>
      </p>
      <div className="ms-auto flex items-center gap-1 sm:gap-2">
        {user ? (
          <UserMenu user={user} onLogout={logout} />
        ) : (
          <span className="flex items-center gap-2.5" aria-hidden="true">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="hidden h-3.5 w-24 sm:block" />
          </span>
        )}
      </div>
    </header>
  );
}

/* ================================================================== page states */

function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 rounded-xl" />
      </div>
    </div>
  );
}

/* ================================================================== shell */

/**
 * Dashboard frame: navy sidebar (role-filtered, active link, off-canvas below lg), top bar with the
 * user menu, skip link, toasts. Shows a skeleton until `/auth/me` resolves, then either the page
 * (wrapped in <Suspense>, so pages may use `useSearchParams`) or the "no permission" state when
 * the route's minimum role (src/lib/admin/nav.ts) is above the user's.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user, error, refresh } = useAdminAuth();
  const pathname = usePathname() ?? "/admin";
  const [menuOpen, setMenuOpen] = useState(false);

  let content: ReactNode;
  if (status === "authenticated" && user) {
    content = hasRole(user.role, requiredAccess(pathname)) ? (
      <Suspense fallback={<PageSkeleton label="Loading page…" />}>{children}</Suspense>
    ) : (
      <ForbiddenState />
    );
  } else if (status === "error") {
    content = (
      <ErrorState
        title="Couldn't load your session"
        error={error}
        onRetry={() => {
          void refresh();
        }}
      />
    );
  } else {
    content = (
      <PageSkeleton
        label={status === "unauthenticated" ? "Redirecting to sign in…" : "Loading dashboard…"}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-[#f8f5ee] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-md bg-night px-4 py-2 text-sm font-medium text-ivory focus:not-sr-only focus:fixed focus:start-4 focus:top-3"
      >
        Skip to content
      </a>
      <aside className="hidden bg-night lg:block">
        <div className="sticky top-0 h-dvh">
          <SidebarNav user={user} pathname={pathname} />
        </div>
      </aside>
      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        pathname={pathname}
      />
      <div className="flex min-h-dvh min-w-0 flex-col">
        <TopBar user={user} pathname={pathname} onMenu={() => setMenuOpen(true)} />
        <main
          id="admin-main"
          tabIndex={-1}
          className="flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          <div className="mx-auto w-full max-w-[1200px]">{content}</div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
