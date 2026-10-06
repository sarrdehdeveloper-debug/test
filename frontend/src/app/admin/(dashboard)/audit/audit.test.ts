import { describe, expect, it } from "vitest";
import {
  ALL_AUDIT_ACTIONS,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  auditActionLabel,
  auditEntityHref,
  summarizeAuditData,
} from "./audit";

describe("audit vocabulary", () => {
  it("lists actions for every entity type", () => {
    for (const { value } of AUDIT_ENTITY_TYPES)
      expect(AUDIT_ACTIONS[value]?.length).toBeGreaterThan(0);
    expect(new Set(ALL_AUDIT_ACTIONS).size).toBe(ALL_AUDIT_ACTIONS.length);
  });

  it("labels every known action without raw snake_case", () => {
    for (const action of ALL_AUDIT_ACTIONS) expect(auditActionLabel(action)).not.toMatch(/_/);
    expect(auditActionLabel("prompt.publish")).toBe("Prompt · Published");
    expect(auditActionLabel("order.retry_generation")).toBe("Order · Retried generation");
    expect(auditActionLabel("auth.mfa_enable")).toBe("Account · Enabled two-factor");
    expect(auditActionLabel("something_new.did_it")).toBe("Something new · Did it");
  });
});

describe("auditEntityHref", () => {
  it("links to the affected page", () => {
    expect(auditEntityHref({ entity_type: "order", entity_id: "abc", data: {} })).toBe(
      "/admin/orders/abc",
    );
    expect(
      auditEntityHref({ entity_type: "prompt_version", entity_id: "9", data: { slot: 3 } }),
    ).toBe("/admin/prompts/3");
    expect(auditEntityHref({ entity_type: "prompt_version", entity_id: "9", data: {} })).toBe(
      "/admin/prompts",
    );
    expect(auditEntityHref({ entity_type: "blog_post", entity_id: "4", data: {} })).toBe(
      "/admin/blog/4",
    );
    expect(auditEntityHref({ entity_type: "seed", entity_id: null, data: {} })).toBeNull();
  });
});

describe("summarizeAuditData", () => {
  it("summarises from/to changes", () => {
    expect(
      summarizeAuditData({
        changes: {
          paid_price_cents: { from: 2900, to: 3100 },
          email_attach_pdf: { from: false, to: true },
        },
      }),
    ).toEqual(["paid_price_cents: 2900 → 3100", "email_attach_pdf: false → true"]);
  });

  it("lists arrays and scalars, skipping noise", () => {
    expect(
      summarizeAuditData({
        slug: "spring",
        fields: ["title", "body"],
        password_reset: false,
        sessions_revoked: 0,
        nested: { a: 1 },
      }),
    ).toEqual(["Slug: spring", "Fields: title, body"]);
  });

  it("limits the number of lines", () => {
    const data = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, i + 1]));
    const lines = summarizeAuditData(data, 4);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("+5 more");
  });

  it("shortens long values", () => {
    const [line] = summarizeAuditData({ note: "x".repeat(100) });
    expect(line.length).toBeLessThan(70);
    expect(line.endsWith("…")).toBe(true);
  });
});
