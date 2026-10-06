// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogs } from "@/i18n/catalog";
import type { City } from "@/lib/types";
import { OrderForm } from "./OrderForm";

const search = { value: "" };
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/en${href}`} {...rest}>
      {children}
    </a>
  ),
}));

const cairo: City = {
  id: 360630,
  name: "Cairo",
  admin1: null,
  country_code: "EG",
  timezone: "Africa/Cairo",
  latitude: 30.06,
  longitude: 31.25,
  population: 9606916,
  is_capital: true,
  label: "Cairo, Egypt",
};
const ORDER_ID = "0b6f0b6e-6a54-4d1e-9a39-6a1d5d0f2a11";

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const assign = vi.fn();

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, origin: "http://127.0.0.1:3000", assign },
  });
});
beforeEach(() => {
  search.value = "";
  assign.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={catalogs.en}>
      <OrderForm
        minDate="1900-01-01"
        listPriceCents={2900}
        currency="USD"
        countries={[{ code: "EG", name: "Egypt", singleZone: true, capitalId: cairo.id }]}
      />
    </NextIntlClientProvider>,
  );
}

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/^Email address/), {
    target: { value: "layla@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Confirm email address/), {
    target: { value: "layla@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: "1990-10-28" } });
  fireEvent.change(screen.getByLabelText(/Time of birth/), { target: { value: "01:30" } });
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/Country of birth/), { target: { value: "EG" } });
  });
  fireEvent.click(screen.getByLabelText(/I accept the/));
}

describe("OrderForm", () => {
  it("asks which time is meant on a DST fall-back, resends with time_fold and goes to checkout", async () => {
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/v1/geo/cities")) return respond(200, { items: [cairo] });
      if (url === "/api/v1/orders") {
        bodies.push(JSON.parse(String(init?.body)));
        if (bodies.length === 1) {
          return respond(422, {
            error: {
              code: "ambiguous_local_time",
              message: "twice",
              details: {
                options: [
                  { fold: 0, utc_offset_minutes: 180, label: "01:30 (UTC+03:00)" },
                  { fold: 1, utc_offset_minutes: 120, label: "01:30 (UTC+02:00)" },
                ],
              },
            },
          });
        }
        return respond(201, {
          order_id: ORDER_ID,
          access_token: "secret-token",
          checkout_url: `http://localhost:3000/en/checkout/fake?order=${ORDER_ID}`,
          amount_cents: 2900,
          currency: "USD",
          status: "awaiting_payment",
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    await fillValidForm();
    expect(
      (screen.getByRole("combobox", { name: /City of birth/ }) as HTMLInputElement).value,
    ).toBe("Cairo, Egypt");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Continue to payment/ }));
    });
    expect(bodies[0]).toMatchObject({
      email: "layla@example.com",
      locale: "en",
      display_name: null,
      birth_date: "1990-10-28",
      birth_time: "01:30",
      city_id: cairo.id,
      time_fold: null,
      discount_code: null,
      marketing_opt_in: false,
      accept_terms: true,
    });

    const panel = screen.getByRole("group", { name: "Which 01:30 do you mean?" });
    expect(document.activeElement).toBe(panel);
    const confirm = within(panel).getByRole("button", { name: /Use this time and continue/ });
    fireEvent.click(confirm);
    expect(within(panel).getByText("Please choose one of the two times.")).toBeTruthy();

    fireEvent.click(within(panel).getByLabelText(/The second 01:30/));
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(bodies[1]).toMatchObject({ time_fold: 1, birth_time: "01:30" });
    expect(window.localStorage.getItem(`zb_order_${ORDER_ID}`)).toBe("secret-token");
    // Our own checkout page is opened on the current origin (where the token was stored).
    expect(assign).toHaveBeenCalledWith(`/en/checkout/fake?order=${ORDER_ID}`);
  });

  it("offers the suggested time when the birth time fell into a DST gap", async () => {
    let orders = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/v1/geo/cities")) return respond(200, { items: [cairo] });
        orders += 1;
        if (orders === 1) {
          return respond(422, {
            error: {
              code: "nonexistent_local_time",
              message: "gap",
              details: { suggested_time: "02:30", suggested_date: "1990-10-28" },
            },
          });
        }
        expect(JSON.parse(String(init?.body)).birth_time).toBe("02:30");
        return respond(201, {
          order_id: ORDER_ID,
          access_token: "t",
          checkout_url: "https://checkout.stripe.com/c/pay/cs_test",
          amount_cents: 2900,
          currency: "USD",
          status: "awaiting_payment",
        });
      }),
    );
    renderForm();
    await fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Continue to payment/ }));
    });
    expect(screen.getByText("01:30 didn't exist on that date")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use 02:30" }));
    });
    expect((screen.getByLabelText(/Time of birth/) as HTMLInputElement).value).toBe("02:30");
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });

  it("prefills and applies the ?code= discount, then shows the reason when a code is refused", async () => {
    search.value = "code=save10";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const code = JSON.parse(String(init?.body)).discount_code;
      if (code === "SAVE10") {
        return respond(200, {
          list_price_cents: 2900,
          discount_cents: 290,
          amount_cents: 2610,
          currency: "USD",
          discount: { code: "SAVE10", kind: "percent", value: 10 },
        });
      }
      return respond(422, {
        error: { code: "invalid_discount_code", message: "x", details: { reason: "exhausted" } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    await act(async () => {});
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/orders/quote");
    // The amount is wrapped in Unicode bidi isolates (correct order inside Arabic sentences).
    expect(
      screen.getByText(/Code SAVE10 applied/).textContent?.replace(/[\u2068\u2069]/g, ""),
    ).toBe("Code SAVE10 applied — you save $2.90.");
    expect(screen.getByText("$26.10")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const input = screen.getByLabelText(/Discount code/);
    fireEvent.change(input, { target: { value: "used-up" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      discount_code: "USED-UP",
    });
    expect(screen.getByText("This code has reached its usage limit.")).toBeTruthy();
    // Back to the list price (item line and total).
    expect(screen.getAllByText("$29")).toHaveLength(2);
  });
});
