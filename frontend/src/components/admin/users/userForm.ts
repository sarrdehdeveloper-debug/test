import { toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import {
  ADMIN_ROLES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AdminRole,
  type ManagedUser,
  type UserCreateIn,
  type UserUpdateIn,
} from "@/lib/admin/types";

/**
 * Admin user forms (owner only): validation mirroring backend/app/admin_auth/schemas.py, the PATCH
 * diff, a password generator and friendly texts for `email_taken` / `last_owner` /
 * `self_change_forbidden`. Pure and tested.
 */

export const NAME_MAX_LENGTH = 200;
export const EMAIL_MAX_LENGTH = 320;

export interface UserCreateForm {
  email: string;
  name: string;
  role: AdminRole | "";
  password: string;
}

export interface UserEditForm {
  name: string;
  role: AdminRole;
  is_active: boolean;
  /** Optional new password ("" = keep). */
  password: string;
}

export type UserFormErrors = Partial<Record<"email" | "name" | "role" | "password", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;

function nameError(name: string): string | undefined {
  const value = name.trim();
  if (!value) return "Enter a name.";
  if (value.length > NAME_MAX_LENGTH) return `Use at most ${NAME_MAX_LENGTH} characters.`;
  return undefined;
}

export function passwordError(password: string, required: boolean): string | undefined {
  if (!password) return required ? "Enter an initial password." : undefined;
  if (!password.trim()) return "The password must not be blank.";
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return undefined;
}

export function validateUserCreate(form: UserCreateForm): UserFormErrors {
  const errors: UserFormErrors = {};
  const email = form.email.trim();
  if (!email) errors.email = "Enter an email address.";
  else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email))
    errors.email = "Enter a valid email address, like name@example.com.";
  const name = nameError(form.name);
  if (name) errors.name = name;
  if (!form.role || !ADMIN_ROLES.includes(form.role)) errors.role = "Choose a role.";
  const password = passwordError(form.password, true);
  if (password) errors.password = password;
  return errors;
}

export function toUserCreate(form: UserCreateForm): UserCreateIn {
  return {
    email: form.email.trim().toLowerCase(),
    name: form.name.trim(),
    role: form.role as AdminRole,
    password: form.password,
  };
}

export function userEditForm(user: ManagedUser): UserEditForm {
  return { name: user.name, role: user.role, is_active: user.is_active, password: "" };
}

export function validateUserEdit(form: UserEditForm): UserFormErrors {
  const errors: UserFormErrors = {};
  const name = nameError(form.name);
  if (name) errors.name = name;
  const password = passwordError(form.password, false);
  if (password) errors.password = password;
  return errors;
}

/**
 * PATCH body with only the changed fields. For your own account the role and active flag are never
 * sent (the API forbids changing them) and neither is a password (use the Account page).
 */
export function userChanges(user: ManagedUser, form: UserEditForm, isSelf: boolean): UserUpdateIn {
  const changes: UserUpdateIn = {};
  if (form.name.trim() !== user.name) changes.name = form.name.trim();
  if (!isSelf) {
    if (form.role !== user.role) changes.role = form.role;
    if (form.is_active !== user.is_active) changes.is_active = form.is_active;
    if (form.password) changes.password = form.password;
  }
  return changes;
}

/** True when `user` is the only active owner (they cannot be demoted or deactivated). */
export function isLastActiveOwner(user: ManagedUser, users: ManagedUser[]): boolean {
  if (user.role !== "owner" || !user.is_active) return false;
  return !users.some((other) => other.id !== user.id && other.role === "owner" && other.is_active);
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!@#%+=";

/**
 * Random initial password (no look-alike characters such as 0/O, 1/l). Uses Web Crypto; `random`
 * may be injected for tests. Always contains a lower-case letter, an upper-case letter and a digit.
 */
export function generatePassword(
  length = 18,
  random: (bytes: Uint32Array) => Uint32Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const size = Math.max(PASSWORD_MIN_LENGTH, Math.min(length, 64));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const values = random(new Uint32Array(size));
    const password = Array.from(
      values,
      (v) => PASSWORD_ALPHABET[v % PASSWORD_ALPHABET.length],
    ).join("");
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)) return password;
  }
  // Practically unreachable; keep the policy anyway.
  return `${"Aa2".repeat(Math.ceil(size / 3))}`.slice(0, size);
}

/** Field → message for a failed create/update (409/422), or null if it belongs at the form level. */
export function userFieldErrorFromApi(err: unknown): UserFormErrors | null {
  const error = toAdminApiError(err);
  if (error.code === "email_taken")
    return { email: "An admin user with this email already exists." };
  if (error.code === "validation_error") {
    const out: UserFormErrors = {};
    for (const [field, message] of Object.entries(error.fields)) {
      if (field === "email" || field === "name" || field === "role" || field === "password") {
        out[field] = message.replace(/^Value error,\s*/i, "");
      }
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

/** Form-level message for user actions, explaining the owner/self rules. */
export function userActionErrorMessage(err: unknown): string {
  const error = toAdminApiError(err);
  switch (error.code) {
    case "last_owner":
      return "At least one active owner must remain. Make another user an owner first.";
    case "self_change_forbidden":
      return "You can't change your own role, status, password or two-factor here. Use your Account page for your password and two-factor.";
    case "email_taken":
      return "An admin user with this email already exists.";
    default:
      return adminErrorMessage(error);
  }
}
