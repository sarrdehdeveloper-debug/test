import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { Quote } from "@/lib/types";
import { DISCOUNT_IDLE, discountReducer, priceBreakdown, type DiscountState } from "./discount";

const quote: Quote = {
  list_price_cents: 2900,
  discount_cents: 290,
  amount_cents: 2610,
  currency: "USD",
  discount: { code: "SAVE10", kind: "percent", value: 10 },
};

describe("discountReducer", () => {
  it("applies a code after a successful quote", () => {
    let s = discountReducer(DISCOUNT_IDLE, { type: "apply", code: "SAVE10" });
    expect(s).toEqual({ status: "checking", code: "SAVE10" });
    s = discountReducer(s, { type: "quoted", code: "SAVE10", quote });
    expect(s).toEqual({ status: "applied", code: "SAVE10", quote });
  });

  it("keeps the reason of a refused code", () => {
    const err = new ApiError(422, "invalid_discount_code", "", { reason: "expired" });
    const s = discountReducer(
      { status: "checking", code: "OLD" },
      { type: "failed", code: "OLD", error: err },
    );
    expect(s).toEqual({ status: "error", code: "OLD", reason: "expired", error: err });
  });

  it("has no reason for network or rate-limit failures", () => {
    const err = ApiError.network();
    expect(
      discountReducer({ status: "checking", code: "X" }, { type: "failed", code: "X", error: err }),
    ).toMatchObject({ status: "error", reason: null });
  });

  it("ignores late answers for another code", () => {
    const checking: DiscountState = { status: "checking", code: "NEW" };
    expect(discountReducer(checking, { type: "quoted", code: "OLD", quote })).toBe(checking);
    expect(
      discountReducer(DISCOUNT_IDLE, { type: "failed", code: "OLD", error: new Error() }),
    ).toBe(DISCOUNT_IDLE);
  });

  it("treats a quote without discount as an unknown code", () => {
    expect(
      discountReducer(
        { status: "checking", code: "X" },
        { type: "quoted", code: "X", quote: { ...quote, discount: null } },
      ),
    ).toMatchObject({ status: "error", reason: "not_found" });
  });

  it("returns to idle on edit, remove or an empty code", () => {
    const applied: DiscountState = { status: "applied", code: "SAVE10", quote };
    expect(discountReducer(applied, { type: "edit" })).toBe(DISCOUNT_IDLE);
    expect(discountReducer(applied, { type: "remove" })).toBe(DISCOUNT_IDLE);
    expect(discountReducer(applied, { type: "apply", code: null })).toBe(DISCOUNT_IDLE);
    expect(discountReducer(DISCOUNT_IDLE, { type: "edit" })).toBe(DISCOUNT_IDLE);
  });

  it("records a code refused by the order endpoint", () => {
    expect(
      discountReducer(
        { status: "applied", code: "SAVE10", quote },
        { type: "rejected", code: "SAVE10", reason: "exhausted" },
      ),
    ).toEqual({ status: "error", code: "SAVE10", reason: "exhausted", error: null });
  });
});

describe("priceBreakdown", () => {
  it("uses the list price until a code is applied", () => {
    expect(priceBreakdown(DISCOUNT_IDLE, { cents: 2900, currency: "USD" })).toEqual({
      listCents: 2900,
      discountCents: 0,
      totalCents: 2900,
      currency: "USD",
      code: null,
    });
    expect(
      priceBreakdown(
        { status: "applied", code: "SAVE10", quote },
        { cents: 2900, currency: "USD" },
      ),
    ).toEqual({
      listCents: 2900,
      discountCents: 290,
      totalCents: 2610,
      currency: "USD",
      code: "SAVE10",
    });
  });
});
