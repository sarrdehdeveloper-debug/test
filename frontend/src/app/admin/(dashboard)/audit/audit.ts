import { humanize } from "@/lib/admin/format";
import type { AuditLogEntry } from "@/lib/admin/types";

/**
 * Audit log vocabulary (every `audit.record` / `_audit` call in the backend) and display helpers.
 * The API filters on exact values, so the filters offer these lists.
 */

export const AUDIT_ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: "order", label: "Orders" },
  { value: "job", label: "Jobs" },
  { value: "prompt_version", label: "Prompts" },
  { value: "settings", label: "Settings" },
  { value: "discount", label: "Discounts" },
  { value: "site_content", label: "Site content" },
  { value: "free_reading", label: "Free readings" },
  { value: "offer", label: "Offers" },
  { value: "book_series", label: "Book series" },
  { value: "book", label: "Books" },
  { value: "blog_post", label: "Blog posts" },
  { value: "media", label: "Media" },
  { value: "admin_user", label: "Admin users & sign-in" },
  { value: "seed", label: "Seed data" },
];

/** `entity_type` → actions recorded for it. */
export const AUDIT_ACTIONS: Record<string, string[]> = {
  order: ["order.retry_generation", "order.resend_email", "order.extend_access"],
  job: ["job.retry"],
  prompt_version: [
    "prompt.create_draft",
    "prompt.update_draft",
    "prompt.delete_draft",
    "prompt.publish",
    "prompt.test",
  ],
  settings: ["settings.update"],
  discount: ["discount.create", "discount.update", "discount.deactivate", "discount.delete"],
  site_content: ["site_content.update"],
  free_reading: ["free_reading.update"],
  offer: ["offer.create", "offer.update", "offer.delete"],
  book_series: ["book_series.create", "book_series.update", "book_series.delete"],
  book: ["book.create", "book.update", "book.delete"],
  blog_post: [
    "blog_post.create",
    "blog_post.update",
    "blog_post.publish",
    "blog_post.unpublish",
    "blog_post.delete",
  ],
  media: ["media.upload", "media.delete"],
  admin_user: [
    "user.create",
    "user.update",
    "user.deactivate",
    "auth.password_change",
    "auth.mfa_enable",
    "auth.mfa_disable",
  ],
  seed: ["seed.run"],
};

export const ALL_AUDIT_ACTIONS: string[] = Object.values(AUDIT_ACTIONS).flat();

const VERB_LABELS: Record<string, string> = {
  retry_generation: "Retried generation",
  resend_email: "Resent email",
  extend_access: "Extended access",
  create_draft: "Created draft",
  update_draft: "Edited draft",
  delete_draft: "Discarded draft",
  test: "Tested with AI",
  password_change: "Changed password",
  mfa_enable: "Enabled two-factor",
  mfa_disable: "Disabled two-factor",
  run: "Ran",
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  publish: "Published",
  unpublish: "Unpublished",
  deactivate: "Deactivated",
  upload: "Uploaded",
  retry: "Retried",
};

const SUBJECT_LABELS: Record<string, string> = {
  order: "Order",
  job: "Job",
  prompt: "Prompt",
  settings: "Settings",
  discount: "Discount",
  site_content: "Site content",
  free_reading: "Free reading",
  offer: "Offer",
  book_series: "Book series",
  book: "Book",
  blog_post: "Blog post",
  media: "Media",
  user: "Admin user",
  auth: "Account",
  seed: "Seed data",
};

/** `"prompt.publish"` → `{subject: "Prompt", verb: "Published"}`. */
export function auditActionParts(action: string): { subject: string; verb: string } {
  const [prefix, ...rest] = action.split(".");
  const verbKey = rest.join(".");
  const subject = SUBJECT_LABELS[prefix] ?? humanize(prefix);
  if (!verbKey) return { subject, verb: "" };
  return { subject, verb: VERB_LABELS[verbKey] ?? humanize(verbKey) };
}

/** `"prompt.publish"` → `"Prompt · Published"`. */
export function auditActionLabel(action: string): string {
  const { subject, verb } = auditActionParts(action);
  return verb ? `${subject} · ${verb}` : subject;
}

const ENTITY_SINGULAR: Record<string, string> = {
  order: "Order",
  job: "Job",
  prompt_version: "Prompt version",
  settings: "Settings",
  discount: "Discount",
  site_content: "Site content",
  free_reading: "Free reading",
  offer: "Offer",
  book_series: "Book series",
  book: "Book",
  blog_post: "Blog post",
  media: "Media file",
  admin_user: "Admin user",
  seed: "Seed data",
};

/** One entity of a type ("Blog post", "Prompt version"), for the list rows. */
export function entityLabel(type: string): string {
  return ENTITY_SINGULAR[type] ?? humanize(type);
}

/** Filter label of a type (plural, "Blog posts"). */
export function entityTypeLabel(type: string): string {
  return AUDIT_ENTITY_TYPES.find((t) => t.value === type)?.label ?? humanize(type);
}

/** Dashboard page of the affected entity, when one exists. */
export function auditEntityHref(
  entry: Pick<AuditLogEntry, "entity_type" | "entity_id" | "data">,
): string | null {
  const id = entry.entity_id;
  switch (entry.entity_type) {
    case "order":
      return id ? `/admin/orders/${id}` : "/admin/orders";
    case "job":
      return "/admin/jobs";
    case "prompt_version": {
      const slot = entry.data?.slot;
      return typeof slot === "number" && slot >= 1 && slot <= 6
        ? `/admin/prompts/${slot}`
        : "/admin/prompts";
    }
    case "settings":
      return "/admin/settings";
    case "discount":
      return "/admin/discounts";
    case "site_content":
      return "/admin/content";
    case "free_reading":
      return "/admin/free-readings";
    case "offer":
      return "/admin/offers";
    case "book_series":
    case "book":
      return "/admin/library";
    case "blog_post":
      return id ? `/admin/blog/${id}` : "/admin/blog";
    case "media":
      return "/admin/media";
    case "admin_user":
      return "/admin/users";
    default:
      return null;
  }
}

function short(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string")
    return value.length > 60 ? `${value.slice(0, 57)}…` : value || '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const text = JSON.stringify(value);
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  } catch {
    return String(value);
  }
}

/**
 * Short human lines summarising `data`: `{changes: {key: {from, to}}}` → "key: from → to";
 * `fields` / `keys` arrays → "Fields: a, b"; other scalar values → "key: value".
 */
export function summarizeAuditData(
  data: Record<string, unknown> | null | undefined,
  limit = 4,
): string[] {
  if (!data || typeof data !== "object") return [];
  const lines: string[] = [];
  const changes = data.changes;
  if (changes && typeof changes === "object" && !Array.isArray(changes)) {
    for (const [key, change] of Object.entries(changes as Record<string, unknown>)) {
      if (change && typeof change === "object" && "from" in change && "to" in change) {
        const { from, to } = change as { from: unknown; to: unknown };
        lines.push(`${key}: ${short(from)} → ${short(to)}`);
      } else {
        lines.push(`${key}: ${short(change)}`);
      }
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === "changes") continue;
    if (Array.isArray(value)) {
      if (value.length) lines.push(`${humanize(key)}: ${value.map((v) => short(v)).join(", ")}`);
    } else if (value === null || typeof value !== "object") {
      if (value === false || value === null || value === 0) continue; // noise ("password_reset: false")
      lines.push(`${humanize(key)}: ${short(value)}`);
    }
  }
  if (lines.length > limit)
    return [...lines.slice(0, limit - 1), `+${lines.length - limit + 1} more`];
  return lines;
}
