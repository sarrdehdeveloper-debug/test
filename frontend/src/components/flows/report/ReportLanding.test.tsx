// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogs } from "@/i18n/catalog";
import { ReportLanding } from "./ReportLanding";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/en${href}`} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:report");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(orderId: string, hash: string) {
  window.history.replaceState(null, "", `/en/report/${orderId}${hash}`);
  return render(
    <NextIntlClientProvider locale="en" messages={catalogs.en}>
      <ReportLanding orderId={orderId} contactEmail="help@example.com" accessHours={24} />
    </NextIntlClientProvider>,
  );
}

describe("ReportLanding", () => {
  it("keeps the token in memory, removes it from the URL and downloads with a Bearer header", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("%PDF-1.7", {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open("order-a", "#t=email-token-123");
    await act(async () => {});
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/en/report/order-a");
    // No automatic download.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download your report/ }));
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/reports/order-a/download");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer email-token-123");
    expect(await screen.findByText(/Your download has started/)).toBeTruthy();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each([
    [410, "report_expired", "This link has expired"],
    [409, "report_not_ready", "Your report isn't ready yet"],
    [404, "not_found", "This link isn't valid"],
  ])("shows a dedicated message for %i", async (status, code, title) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code, message: "x", details: {} } }), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    open(`order-${status}`, "#t=tok");
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download your report/ }));
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    if (status === 409) {
      expect(screen.getByRole("link", { name: /View order status/ }).getAttribute("href")).toBe(
        "/en/order/order-409",
      );
    }
  });

  it("explains an incomplete link", async () => {
    open("order-missing", "");
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This link is incomplete");
  });
});
