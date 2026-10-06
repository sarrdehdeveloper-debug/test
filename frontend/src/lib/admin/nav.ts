import { hasRole, type AccessLevel } from "./roles";
import type { AdminRole } from "./types";

/**
 * The dashboard route map: sidebar sections, links and the minimum role of every route.
 * AdminShell renders the sidebar from it AND blocks pages the user's role may not open (it shows
 * the "no permission" state instead), using the longest matching `href` prefix.
 * Adding a page under an existing route needs no change here; a new top-level route does.
 */

export type AdminIconName =
  | "overview"
  | "orders"
  | "discounts"
  | "content"
  | "readings"
  | "offers"
  | "library"
  | "blog"
  | "media"
  | "prompts"
  | "jobs"
  | "settings"
  | "users"
  | "audit"
  | "account";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminIconName;
  access: AccessLevel;
  /** Match only the exact path (the overview `/admin`). */
  exact?: boolean;
}

export interface AdminNavSection {
  id: string;
  /** Visible group heading (none for the first group). */
  label?: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    id: "main",
    items: [
      { href: "/admin", label: "Overview", icon: "overview", access: "manager", exact: true },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", icon: "orders", access: "manager" },
      { href: "/admin/discounts", label: "Discounts", icon: "discounts", access: "manager" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { href: "/admin/content", label: "Site content", icon: "content", access: "editor" },
      { href: "/admin/free-readings", label: "Free readings", icon: "readings", access: "editor" },
      { href: "/admin/offers", label: "Offers", icon: "offers", access: "editor" },
      { href: "/admin/library", label: "Galaxy Library", icon: "library", access: "editor" },
      { href: "/admin/blog", label: "Blog", icon: "blog", access: "editor" },
      { href: "/admin/media", label: "Media", icon: "media", access: "editor" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [{ href: "/admin/prompts", label: "Prompts", icon: "prompts", access: "manager" }],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/admin/jobs", label: "Jobs", icon: "jobs", access: "manager" },
      { href: "/admin/settings", label: "Settings", icon: "settings", access: "manager" },
      { href: "/admin/users", label: "Users", icon: "users", access: "owner" },
      { href: "/admin/audit", label: "Audit log", icon: "audit", access: "manager" },
    ],
  },
];

/** Routes outside the sidebar with their own access level. */
const EXTRA_ROUTES: Array<Pick<AdminNavItem, "href" | "access" | "exact">> = [
  { href: "/admin/account", access: "editor" },
];

/**
 * Sidebar sections visible to `role`. Editors get an "Overview" entry too: `/admin` shows them a
 * content-focused welcome page.
 */
export function visibleNav(role: AdminRole | null | undefined): AdminNavSection[] {
  return ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => hasRole(role, item.access) || (item.href === "/admin" && hasRole(role, "editor")),
    ),
  })).filter((section) => section.items.length > 0);
}

function normalize(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Is the nav link `href` active for `pathname`? (`/admin/blog` matches `/admin/blog/12`.) */
export function isNavActive(pathname: string, href: string, exact = false): boolean {
  const path = normalize(pathname);
  if (exact || href === "/admin") return path === href;
  return path === href || path.startsWith(`${href}/`);
}

/** Minimum access level of a dashboard path (longest matching route; `/admin` itself = editor). */
export function requiredAccess(pathname: string): AccessLevel {
  const path = normalize(pathname);
  const routes = [...ADMIN_NAV.flatMap((section) => section.items), ...EXTRA_ROUTES]
    .filter((item) => item.href !== "/admin")
    .sort((a, b) => b.href.length - a.href.length);
  const match = routes.find((item) => isNavActive(path, item.href, item.exact));
  // The overview adapts to the role (editors see a welcome page).
  return match ? match.access : "editor";
}

/** Label of the nav item matching `pathname` (for the top bar), or null. */
export function activeNavItem(pathname: string): AdminNavItem | null {
  const items = ADMIN_NAV.flatMap((section) => section.items).sort(
    (a, b) => b.href.length - a.href.length,
  );
  return items.find((item) => isNavActive(pathname, item.href, item.exact)) ?? null;
}
