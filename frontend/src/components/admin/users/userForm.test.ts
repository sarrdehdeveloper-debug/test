import { describe, expect, it } from "vitest";
import { AdminApiError } from "@/lib/admin/api";
import type { ManagedUser } from "@/lib/admin/types";
import {
  generatePassword,
  isLastActiveOwner,
  toUserCreate,
  userActionErrorMessage,
  userChanges,
  userEditForm,
  userFieldErrorFromApi,
  validateUserCreate,
  validateUserEdit,
} from "./userForm";

const user = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: 5,
  email: "sam@example.com",
  name: "Sam",
  role: "editor",
  mfa_enabled: false,
  last_login_at: null,
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...overrides,
});

describe("validateUserCreate", () => {
  const valid = {
    email: " New.Admin@Example.com ",
    name: " New Admin ",
    role: "admin" as const,
    password: "correct-horse-battery",
  };

  it("accepts a valid form and normalises it", () => {
    expect(validateUserCreate(valid)).toEqual({});
    expect(toUserCreate(valid)).toEqual({
      email: "new.admin@example.com",
      name: "New Admin",
      role: "admin",
      password: "correct-horse-battery",
    });
  });

  it("reports every invalid field", () => {
    const errors = validateUserCreate({ email: "nope", name: " ", role: "", password: "short" });
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "password", "role"]);
    expect(errors.password).toBe("Use at least 12 characters.");
    expect(validateUserCreate({ ...valid, password: " ".repeat(12) }).password).toMatch(/blank/);
    expect(validateUserCreate({ ...valid, email: "a@b" }).email).toBeDefined();
  });
});

describe("user edit", () => {
  it("sends only changes", () => {
    const current = user();
    const form = userEditForm(current);
    expect(userChanges(current, form, false)).toEqual({});
    expect(
      userChanges(current, { ...form, name: " Sam Lee ", role: "admin", is_active: false }, false),
    ).toEqual({ name: "Sam Lee", role: "admin", is_active: false });
    expect(userChanges(current, { ...form, password: "a-new-password-123" }, false)).toEqual({
      password: "a-new-password-123",
    });
  });

  it("never sends role, status or password for yourself", () => {
    const me = user({ role: "owner" });
    const form = {
      ...userEditForm(me),
      name: "Me",
      role: "editor" as const,
      is_active: false,
      password: "x".repeat(12),
    };
    expect(userChanges(me, form, true)).toEqual({ name: "Me" });
  });

  it("validates the optional password", () => {
    expect(validateUserEdit({ ...userEditForm(user()), password: "" })).toEqual({});
    expect(validateUserEdit({ ...userEditForm(user()), password: "short" }).password).toBeDefined();
    expect(validateUserEdit({ ...userEditForm(user()), name: "" }).name).toBeDefined();
  });
});

describe("isLastActiveOwner", () => {
  it("detects the only active owner", () => {
    const owner = user({ id: 1, role: "owner" });
    const inactiveOwner = user({ id: 2, role: "owner", is_active: false });
    expect(isLastActiveOwner(owner, [owner, inactiveOwner, user()])).toBe(true);
    expect(isLastActiveOwner(owner, [owner, user({ id: 3, role: "owner" })])).toBe(false);
    expect(isLastActiveOwner(user(), [user()])).toBe(false);
  });
});

describe("generatePassword", () => {
  it("meets the policy", () => {
    for (let i = 0; i < 20; i += 1) {
      const password = generatePassword();
      expect(password).toHaveLength(18);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[0O1lI]/);
    }
    expect(generatePassword(4)).toHaveLength(12);
  });

  it("retries until every character class is present", () => {
    let call = 0;
    const random = (bytes: Uint32Array) => {
      call += 1;
      // First draw: only "A" (index 0); then a real mix.
      return bytes.map((_, i) => (call === 1 ? 0 : i * 7 + 3));
    };
    const password = generatePassword(12, random);
    expect(call).toBe(2);
    expect(password).toMatch(/[a-z]/);
  });
});

describe("API errors", () => {
  it("maps email_taken and validation errors to fields", () => {
    expect(userFieldErrorFromApi(new AdminApiError(409, "email_taken", "x"))).toEqual({
      email: "An admin user with this email already exists.",
    });
    const validation = new AdminApiError(422, "validation_error", "Invalid input", {
      fields: [{ field: "password", message: "String should have at least 12 characters" }],
    });
    expect(userFieldErrorFromApi(validation)).toEqual({
      password: "String should have at least 12 characters",
    });
    expect(userFieldErrorFromApi(new AdminApiError(409, "last_owner", "x"))).toBeNull();
  });

  it("explains owner and self rules", () => {
    expect(userActionErrorMessage(new AdminApiError(409, "last_owner", "x"))).toMatch(
      /another user an owner/,
    );
    expect(userActionErrorMessage(new AdminApiError(403, "self_change_forbidden", "x"))).toMatch(
      /Account page/,
    );
  });
});
