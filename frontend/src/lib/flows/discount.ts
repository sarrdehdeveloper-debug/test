import { discountErrorReason, isApiError } from "@/lib/api/errors";
import type { DiscountErrorReason, Quote } from "@/lib/types";

/**
 * Discount-code state of the paid order form (POST /orders/quote):
 *   idle --apply--> checking --quoted--> applied
 *                            --failed--> error
 * Editing the code or removing it returns to idle; a late answer for an older code is ignored.
 */
export type DiscountState =
  | { status: "idle" }
  | { status: "checking"; code: string }
  | { status: "applied"; code: string; quote: Quote }
  | {
      status: "error";
      code: string;
      /** Reason of a 422 invalid_discount_code; null for other failures (network, 429...). */
      reason: DiscountErrorReason | null;
      error: unknown;
    };

export type DiscountEvent =
  | { type: "apply"; code: string | null }
  | { type: "quoted"; code: string; quote: Quote }
  | { type: "failed"; code: string; error: unknown }
  /** The order itself was refused because of the code (e.g. it expired meanwhile). */
  | { type: "rejected"; code: string; reason: DiscountErrorReason | null }
  | { type: "edit" }
  | { type: "remove" };

export const DISCOUNT_IDLE: DiscountState = { status: "idle" };

export function discountReducer(state: DiscountState, event: DiscountEvent): DiscountState {
  switch (event.type) {
    case "apply":
      return event.code ? { status: "checking", code: event.code } : DISCOUNT_IDLE;
    case "quoted":
      if (state.status !== "checking" || state.code !== event.code) return state;
      if (!event.quote.discount) {
        return { status: "error", code: event.code, reason: "not_found", error: null };
      }
      return { status: "applied", code: event.quote.discount.code, quote: event.quote };
    case "failed":
      if (state.status !== "checking" || state.code !== event.code) return state;
      return {
        status: "error",
        code: event.code,
        reason: isApiError(event.error) ? discountErrorReason(event.error) : null,
        error: event.error,
      };
    case "rejected":
      return { status: "error", code: event.code, reason: event.reason, error: null };
    case "edit":
    case "remove":
      return state.status === "idle" ? state : DISCOUNT_IDLE;
  }
}

export interface PriceBreakdown {
  listCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  code: string | null;
}

/** Price to show: the applied quote, or the list price from public-config. */
export function priceBreakdown(
  state: DiscountState,
  list: { cents: number; currency: string },
): PriceBreakdown {
  if (state.status === "applied") {
    const q = state.quote;
    return {
      listCents: q.list_price_cents,
      discountCents: q.discount_cents,
      totalCents: q.amount_cents,
      currency: q.currency,
      code: q.discount?.code ?? state.code,
    };
  }
  return {
    listCents: list.cents,
    discountCents: 0,
    totalCents: list.cents,
    currency: list.currency,
    code: null,
  };
}
