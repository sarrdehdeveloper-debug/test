import { describe, expect, it } from "vitest";
import { progressPercent, progressSteps } from "./progress";
import { parseReportToken, resolveCheckoutUrl } from "./report";
import { animalPolarity, signQualities } from "./zodiac";

describe("parseReportToken", () => {
  it("reads the token from the fragment", () => {
    expect(parseReportToken("#t=abc_DEF-123")).toBe("abc_DEF-123");
    expect(parseReportToken("t=xyz")).toBe("xyz");
    expect(parseReportToken("#token=xyz&utm=1")).toBe("xyz");
  });

  it("rejects missing, blank or oversized tokens", () => {
    expect(parseReportToken("")).toBeNull();
    expect(parseReportToken("#")).toBeNull();
    expect(parseReportToken("#t=")).toBeNull();
    expect(parseReportToken("#other=1")).toBeNull();
    expect(parseReportToken(`#t=${"a".repeat(257)}`)).toBeNull();
  });
});

describe("resolveCheckoutUrl", () => {
  const origin = "http://127.0.0.1:3000";

  it("keeps our own flow pages on the current origin", () => {
    expect(resolveCheckoutUrl("http://localhost:3000/en/checkout/fake?order=abc", origin)).toBe(
      "/en/checkout/fake?order=abc",
    );
    expect(resolveCheckoutUrl("https://zodiacblend.com/ar/order/abc", origin)).toBe(
      "/ar/order/abc",
    );
    expect(resolveCheckoutUrl("/en/order/abc?paid=1", origin)).toBe("/en/order/abc?paid=1");
  });

  it("leaves external payment pages untouched", () => {
    expect(resolveCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_1#fid", origin)).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_1#fid",
    );
  });

  it("never navigates to script URLs", () => {
    expect(resolveCheckoutUrl("javascript:alert(1)", origin)).toBe(origin);
  });
});

describe("progressSteps", () => {
  const p = (done: number) => ({ sections_done: done, sections_total: 6 });
  const states = (status: Parameters<typeof progressSteps>[0]["status"], done = 0) =>
    progressSteps({ status, progress: p(done) }).map((s) => s.state);

  it("follows the order lifecycle", () => {
    expect(states("paid")).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(states("queued")).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(states("generating", 3)).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
    expect(states("generating", 6)).toEqual(["done", "done", "done", "current", "upcoming"]);
    expect(states("ready", 6)).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("computes a monotonic percentage", () => {
    const values = [
      progressPercent({ status: "paid", progress: p(0) }),
      progressPercent({ status: "queued", progress: p(0) }),
      progressPercent({ status: "generating", progress: p(0) }),
      progressPercent({ status: "generating", progress: p(3) }),
      progressPercent({ status: "generating", progress: p(6) }),
      progressPercent({ status: "ready", progress: p(6) }),
    ];
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.at(-1)).toBe(100);
    // Bad totals from the API do not break the bar.
    expect(
      progressPercent({ status: "generating", progress: { sections_done: 9, sections_total: 0 } }),
    ).toBe(90);
  });
});

describe("animalPolarity", () => {
  it("alternates yang/yin through the twelve animals", () => {
    expect(animalPolarity("rat")).toBe("yang");
    expect(animalPolarity("ox")).toBe("yin");
    expect(animalPolarity("horse")).toBe("yang");
    expect(animalPolarity("pig")).toBe("yin");
  });
});

describe("signQualities", () => {
  it("knows the element and modality of each sign", () => {
    expect(signQualities("aries")).toEqual({ element: "fire", modality: "cardinal" });
    expect(signQualities("leo")).toEqual({ element: "fire", modality: "fixed" });
    expect(signQualities("aquarius")).toEqual({ element: "air", modality: "fixed" });
    expect(signQualities("pisces")).toEqual({ element: "water", modality: "mutable" });
    expect(signQualities("capricorn")).toEqual({ element: "earth", modality: "cardinal" });
  });
});
