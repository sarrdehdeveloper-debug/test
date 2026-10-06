import { describe, expect, it } from "vitest";
import { activeNavItem, ADMIN_NAV, isNavActive, requiredAccess, visibleNav } from "./nav";
import { hasRole, isManager } from "./roles";
import { ADMIN_HOME, loginHref, safeNextPath } from "./redirect";

const labels = (role: Parameters<typeof visibleNav>[0]) =>
  visibleNav(role).flatMap((section) => section.items.map((item) => item.label));

describe("roles", () => {
  it("orders owner ⊃ admin ⊃ editor", () => {
    expect(hasRole("owner", "manager")).toBe(true);
    expect(hasRole("admin", "manager")).toBe(true);
    expect(hasRole("editor", "manager")).toBe(false);
    expect(hasRole("admin", "owner")).toBe(false);
    expect(hasRole("editor", "editor")).toBe(true);
    expect(hasRole(null, "editor")).toBe(false);
    expect(isManager("owner")).toBe(true);
    expect(isManager("editor")).toBe(false);
  });
});

describe("visibleNav", () => {
  it("shows editors the overview and the content sections only", () => {
    expect(labels("editor")).toEqual([
      "Overview",
      "Site content",
      "Free readings",
      "Offers",
      "Galaxy Library",
      "Blog",
      "Media",
    ]);
  });

  it("shows admins everything but users, owners everything", () => {
    expect(labels("admin")).not.toContain("Users");
    expect(labels("admin")).toContain("Audit log");
    expect(labels("owner")).toContain("Users");
    expect(labels("owner")).toHaveLength(ADMIN_NAV.flatMap((s) => s.items).length);
    expect(visibleNav(null)).toEqual([]);
  });

  it("links every route of the route map", () => {
    const hrefs = ADMIN_NAV.flatMap((s) => s.items.map((i) => i.href)).sort();
    expect(hrefs).toEqual(
      [
        "/admin",
        "/admin/orders",
        "/admin/discounts",
        "/admin/content",
        "/admin/free-readings",
        "/admin/offers",
        "/admin/library",
        "/admin/blog",
        "/admin/media",
        "/admin/prompts",
        "/admin/jobs",
        "/admin/settings",
        "/admin/users",
        "/admin/audit",
      ].sort(),
    );
  });
});

describe("active link and route access", () => {
  it("matches sections and their sub-pages", () => {
    expect(isNavActive("/admin", "/admin")).toBe(true);
    expect(isNavActive("/admin/orders", "/admin")).toBe(false);
    expect(isNavActive("/admin/blog/12", "/admin/blog")).toBe(true);
    expect(isNavActive("/admin/blog/", "/admin/blog")).toBe(true);
    expect(isNavActive("/admin/blogroll", "/admin/blog")).toBe(false);
    expect(isNavActive("/admin/orders?status=ready", "/admin/orders")).toBe(true);
    expect(activeNavItem("/admin/prompts/3")?.label).toBe("Prompts");
    expect(activeNavItem("/admin/account")).toBeNull();
  });

  it("derives the minimum role of a path", () => {
    expect(requiredAccess("/admin")).toBe("editor");
    expect(requiredAccess("/admin/account")).toBe("editor");
    expect(requiredAccess("/admin/blog/4")).toBe("editor");
    expect(requiredAccess("/admin/orders/abc")).toBe("manager");
    expect(requiredAccess("/admin/discounts")).toBe("manager");
    expect(requiredAccess("/admin/users")).toBe("owner");
    expect(requiredAccess("/admin/unknown")).toBe("editor");
  });
});

describe("safeNextPath", () => {
  it("accepts same-origin /admin paths with query and hash", () => {
    expect(safeNextPath("/admin/orders?status=ready#top")).toBe("/admin/orders?status=ready#top");
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/admin/../admin/blog")).toBe("/admin/blog");
  });

  it("rejects everything else", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example/admin",
      "//evil.example/admin",
      "/\\evil.example",
      "/admin\\..\\x",
      "javascript:alert(1)",
      "/en/free",
      "/administrator",
      "/admin/../en",
      "/admin/login",
      "/admin/login?next=/admin",
      "/admin\n/x",
      `/admin/${"a".repeat(3000)}`,
    ]) {
      expect(safeNextPath(bad)).toBe(ADMIN_HOME);
    }
    expect(safeNextPath("https://evil.example", "/admin/account")).toBe("/admin/account");
  });

  it("builds login URLs", () => {
    expect(loginHref("/admin/orders?status=ready")).toBe(
      "/admin/login?next=%2Fadmin%2Forders%3Fstatus%3Dready",
    );
    expect(loginHref("/admin")).toBe("/admin/login");
    expect(loginHref("https://evil.example")).toBe("/admin/login");
    expect(loginHref()).toBe("/admin/login");
  });
});
