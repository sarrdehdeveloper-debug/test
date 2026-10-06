import type { AdminRole } from "./types";

/**
 * Role hierarchy: `owner` ⊃ `admin` ⊃ `editor` (backend `require_editor/manager/owner`).
 * "manager" is an alias for the minimum role `admin` (owners and admins).
 */
export type AccessLevel = AdminRole | "manager";

const RANK: Record<AdminRole, number> = { editor: 1, admin: 2, owner: 3 };
const REQUIRED: Record<AccessLevel, number> = { editor: 1, manager: 2, admin: 2, owner: 3 };

/** True when `role` is at least `required` (`hasRole("owner", "manager") === true`). */
export function hasRole(role: AdminRole | null | undefined, required: AccessLevel): boolean {
  if (!role || !(role in RANK)) return false;
  return RANK[role] >= REQUIRED[required];
}

export function isManager(role: AdminRole | null | undefined): boolean {
  return hasRole(role, "manager");
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  owner: "Everything, including admin users",
  admin: "Orders, prompts, settings and all content",
  editor: "Content only: site copy, readings, offers, library, blog, media",
};
