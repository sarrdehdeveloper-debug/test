// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogs } from "@/i18n/catalog";
import type { FreeReadingResult } from "@/lib/types";
import { FreeReadingFlow } from "./FreeReadingFlow";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/en${href}`} {...rest}>
      {children}
    </a>
  ),
}));

const result: FreeReadingResult = {
  signs: {
    sun_sign: "aquarius",
    sun_sign_alternative: null,
    year_animal: "horse",
    year_element: "metal",
    year_animal_alternative: "snake",
    year_boundary: "lichun",
  },
  sign_reading: {
    key: "aquarius",
    title: "Aquarius — The Visionary",
    body_html: "<p>Sign text</p>",
  },
  animal_reading: null,
};

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function renderFlow() {
  return render(
    <NextIntlClientProvider locale="en" messages={catalogs.en}>
      <FreeReadingFlow
        locales={[
          { code: "en", label: "English" },
          { code: "ar", label: "العربية" },
        ]}
        minDate="1900-01-01"
        priceLabel="$29"
      />
    </NextIntlClientProvider>,
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FreeReadingFlow", () => {
  it("validates on the client before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /Reveal my blend/ }));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("This field is required.")).toHaveLength(2);
    expect(document.activeElement?.getAttribute("name")).toBe("birthDate");
    // The language is preselected to the current locale; marketing is opt-in.
    expect((screen.getByLabelText(/Language of your reading/) as HTMLSelectElement).value).toBe(
      "en",
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("shows the blend, the boundary notice and focuses the result heading", async () => {
    const fetchMock = vi.fn(async () => respond(200, result));
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();
    fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: "1990-02-04" } });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: " Visitor@Example.com " },
    });
    fireEvent.change(screen.getByLabelText(/Language of your reading/), {
      target: { value: "ar" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reveal my blend/ }));
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/free-reading");
    expect(JSON.parse(String(init.body))).toEqual({
      birth_date: "1990-02-04",
      email: "Visitor@Example.com",
      locale: "ar",
      marketing_opt_in: false,
    });

    const heading = screen.getByRole("heading", { name: "Two traditions, one portrait" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getAllByText("Aquarius").length).toBeGreaterThan(0);
    expect(screen.getByText("Yang · Metal")).toBeTruthy();
    expect(screen.getByText("Fixed · Air")).toBeTruthy();
    expect(screen.getByText(/may be the Horse or the Snake/)).toBeTruthy();
    expect(screen.getByText("Sign text")).toBeTruthy();
    expect(screen.getByText(/This reading isn't available right now/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Get my full report/ }).getAttribute("href")).toBe(
      "/en/reading",
    );

    fireEvent.click(screen.getByRole("button", { name: /Start again/ }));
    expect(screen.getByRole("heading", { name: "When were you born?" })).toBe(
      document.activeElement,
    );
  });

  it("maps API errors to fields and rate limits to a timed message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respond(422, {
          error: {
            code: "validation_error",
            message: "Invalid input",
            details: { fields: [{ field: "email", message: "not valid", type: "value_error" }] },
          },
        }),
      )
      .mockResolvedValueOnce(
        respond(
          429,
          { error: { code: "rate_limited", message: "slow down", details: {} } },
          { "Retry-After": "120" },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();
    fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: "1990-02-04" } });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: "odd@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reveal my blend/ }));
    });
    expect(screen.getByText("Please enter a valid email address.")).toBeTruthy();
    expect(document.activeElement?.getAttribute("name")).toBe("email");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reveal my blend/ }));
    });
    expect(screen.getByRole("alert").textContent).toContain("try again in 2 minutes");
  });
});
