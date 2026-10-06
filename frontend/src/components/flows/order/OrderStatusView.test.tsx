// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogs } from "@/i18n/catalog";
import type { OrderStatus, OrderStatusOut } from "@/lib/types";
import { OrderStatusView } from "./OrderStatusView";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/en${href}`} {...rest}>
      {children}
    </a>
  ),
}));

const ID = "3f1c2a9e-1d2b-4c3d-8e4f-5a6b7c8d9e0f";

function order(status: OrderStatus, extra: Partial<OrderStatusOut> = {}): OrderStatusOut {
  return {
    order_id: ID,
    status,
    locale: "en",
    email_masked: "l***@example.com",
    amount_cents: 2900,
    currency: "USD",
    created_at: "2026-10-06T12:00:00Z",
    paid_at: "2026-10-06T12:01:00Z",
    ready_at: null,
    access_expires_at: null,
    download_available: false,
    progress: { sections_done: 2, sections_total: 6 },
    signs: {
      sun: "leo",
      moon: "pisces",
      ascendant: null,
      year_animal: "horse",
      month_animal: "monkey",
      day_animal: "rabbit",
    },
    ...extra,
  };
}

function serve(body: OrderStatusOut | null, status = 200) {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify(body ?? { error: { code: "not_found", message: "x", details: {} } }),
        { status, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={catalogs.en}>
      <OrderStatusView orderId={ID} contactEmail="help@example.com" accessHours={24} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrderStatusView", () => {
  it("explains how to get the report when this browser has no token", async () => {
    const fetchMock = serve(order("ready"));
    renderView();
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Open your report from your email",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "help@example.com" }).getAttribute("href")).toBe(
      "mailto:help@example.com",
    );
  });

  it("shows progress with the token header and announces the current chapter", async () => {
    window.localStorage.setItem(`zb_order_${ID}`, "tok");
    const fetchMock = serve(order("generating"));
    renderView();
    await act(async () => {});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/orders/${ID}`);
    expect(new Headers(init.headers).get("X-Order-Token")).toBe("tok");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Your report is being created",
    );
    expect(screen.getByText("2 of 6 chapters")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("43");
    expect(screen.getAllByRole("status")[0].textContent).toBe("Writing chapter 3 of 6.");
    // Missing signs render as a dash rather than breaking the summary.
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("offers the download with the time left once ready", async () => {
    window.localStorage.setItem(`zb_order_${ID}`, "tok");
    const expires = new Date(Date.now() + (5 * 60 + 30) * 60_000 + 20_000).toISOString();
    serve(order("ready", { download_available: true, access_expires_at: expires }));
    renderView();
    await act(async () => {});
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(screen.getByRole("button", { name: /Download your report/ })).toBeTruthy();
    expect(screen.getByText("Link active for 5h 31m")).toBeTruthy();
    expect(screen.getByText(/emailed the link to/).textContent).toContain("l***@example.com");
  });

  it("treats a ready order without download access as expired, and 404 as not found", async () => {
    window.localStorage.setItem(`zb_order_${ID}`, "tok");
    serve(order("ready", { download_available: false }));
    const { unmount } = renderView();
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This download has expired");
    unmount();

    serve(null, 404);
    renderView();
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Order not found");
  });
});
