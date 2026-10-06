/**
 * Discount-code form model (managers): API row ⇄ form values ⇄ create/PATCH bodies, client
 * validation mirroring the API, and display helpers (value, usage, state).
 */
import { formatMoney } from "@/lib/admin/format";
import type { Discount, DiscountCreate, DiscountKind, DiscountUpdate } from "@/lib/admin/types";
import { diffFields, windowError } from "../content/forms";

export interface DiscountFormValues {
  code: string;
  description: string;
  kind: DiscountKind;
  /** Percent text (kind "percent"). */
  percent: string;
  /** Amount in minor units (kind "fixed"). */
  amount_cents: number | null;
  currency: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  /** "" = unlimited. */
  max_redemptions: string;
}

export function discountToForm(
  discount: Discount | null,
  defaultCurrency = "USD",
): DiscountFormValues {
  const kind = discount?.kind ?? "percent";
  return {
    code: discount?.code ?? "",
    description: discount?.description ?? "",
    kind,
    percent: kind === "percent" && discount ? String(discount.value) : "",
    amount_cents: kind === "fixed" && discount ? discount.value : null,
    currency: discount?.currency ?? defaultCurrency,
    is_active: discount?.is_active ?? true,
    starts_at: discount?.starts_at ?? null,
    ends_at: discount?.ends_at ?? null,
    max_redemptions: discount?.max_redemptions ? String(discount.max_redemptions) : "",
  };
}

/** "welcome 10" → "WELCOME10"-style input normalisation (upper case, no spaces). */
export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

function parsePositiveInt(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
}

export function discountPayload(values: DiscountFormValues): DiscountCreate {
  const fixed = values.kind === "fixed";
  return {
    code: normalizeCode(values.code.trim()),
    description: values.description.trim(),
    kind: values.kind,
    value: fixed ? (values.amount_cents ?? 0) : (parsePositiveInt(values.percent) ?? 0),
    currency: fixed ? values.currency.trim().toUpperCase() || null : null,
    is_active: values.is_active,
    starts_at: values.starts_at,
    ends_at: values.ends_at,
    max_redemptions: parsePositiveInt(values.max_redemptions) ?? null,
  };
}

export function discountPatch(
  initial: DiscountFormValues,
  values: DiscountFormValues,
): DiscountUpdate {
  return diffFields(discountPayload(initial), discountPayload(values));
}

export function validateDiscount(values: DiscountFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const code = normalizeCode(values.code.trim());
  if (!code) errors.code = "Enter a code.";
  else if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
    errors.code = "Use 3–64 characters: letters, digits, - or _.";
  }
  if (values.description.trim().length > 300) errors.description = "Use at most 300 characters.";
  if (values.kind === "percent") {
    const percent = parsePositiveInt(values.percent);
    if (percent === null) errors.value = "Enter a percentage.";
    else if (percent === undefined || percent > 100)
      errors.value = "Enter a whole number from 1 to 100.";
  } else {
    if (values.amount_cents === null) errors.value = "Enter an amount.";
    else if (values.amount_cents < 1) errors.value = "The amount must be more than zero.";
    else if (values.amount_cents > 100_000_000) errors.value = "The amount is too large.";
    if (!/^[A-Za-z]{3}$/.test(values.currency.trim()))
      errors.currency = "Use a 3-letter currency code.";
  }
  const window = windowError(values.starts_at, values.ends_at);
  if (window) errors.ends_at = window;
  if (parsePositiveInt(values.max_redemptions) === undefined) {
    errors.max_redemptions = "Enter a whole number of at least 1, or leave empty for unlimited.";
  }
  return errors;
}

/** "10%" or "$5.00". */
export function discountValueLabel(
  discount: Pick<Discount, "kind" | "value" | "currency">,
): string {
  return discount.kind === "percent"
    ? `${discount.value}%`
    : formatMoney(discount.value, discount.currency ?? "USD");
}

export type DiscountState = "active" | "inactive" | "scheduled" | "expired" | "exhausted";

/** Whether checkout would accept the code right now (same rules as the API). */
export function discountState(
  discount: Pick<
    Discount,
    "is_active" | "starts_at" | "ends_at" | "max_redemptions" | "redemptions_count"
  >,
  now: number = Date.now(),
): DiscountState {
  if (!discount.is_active) return "inactive";
  if (discount.starts_at && Date.parse(discount.starts_at) > now) return "scheduled";
  if (discount.ends_at && Date.parse(discount.ends_at) <= now) return "expired";
  if (discount.max_redemptions !== null && discount.redemptions_count >= discount.max_redemptions) {
    return "exhausted";
  }
  return "active";
}

export const DISCOUNT_STATE_STYLE: Record<
  DiscountState,
  { label: string; tone: "success" | "neutral" | "gold" | "warning" | "danger" }
> = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "gold" },
  expired: { label: "Expired", tone: "warning" },
  exhausted: { label: "Used up", tone: "warning" },
};

/** Usage: "12 / 100" or "12 / ∞", with a 0..1 fraction (null when unlimited). */
export function discountUsage(discount: Pick<Discount, "redemptions_count" | "max_redemptions">): {
  label: string;
  fraction: number | null;
} {
  const used = discount.redemptions_count;
  if (discount.max_redemptions === null) return { label: `${used} / ∞`, fraction: null };
  return {
    label: `${used} / ${discount.max_redemptions}`,
    fraction: Math.min(1, used / Math.max(1, discount.max_redemptions)),
  };
}

/** Option label for the offer form's discount select: "WELCOME10 · 10% off · inactive". */
export function discountOptionLabel(discount: Discount, now: number = Date.now()): string {
  const state = discountState(discount, now);
  const parts = [discount.code, `${discountValueLabel(discount)} off`];
  if (state !== "active") parts.push(DISCOUNT_STATE_STYLE[state].label.toLowerCase());
  return parts.join(" · ");
}
