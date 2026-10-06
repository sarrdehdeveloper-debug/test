// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogs } from "@/i18n/catalog";
import type { City } from "@/lib/types";
import { BirthplaceFields } from "./BirthplaceFields";

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
const alexandria: City = {
  ...cairo,
  id: 361058,
  name: "Alexandria",
  is_capital: false,
  label: "Alexandria, Egypt",
};

const countries = [
  { code: "EG", name: "Egypt", singleZone: true, capitalId: cairo.id },
  { code: "US", name: "United States", singleZone: false, capitalId: 4140963 },
];

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Harness({ onCity }: { onCity: (c: City | null) => void }) {
  const [country, setCountry] = useState("");
  const [city, setCity] = useState<City | null>(null);
  return (
    <NextIntlClientProvider locale="en" messages={catalogs.en}>
      <BirthplaceFields
        initialCountries={countries}
        country={country}
        city={city}
        onCountryChange={setCountry}
        onCityChange={(c) => {
          setCity(c);
          onCity(c);
        }}
      />
    </NextIntlClientProvider>
  );
}

describe("BirthplaceFields", () => {
  it("preselects the capital of a single-time-zone country, then lets the visitor search", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("q=Alex")) return jsonResponse({ items: [alexandria] });
      return jsonResponse({ items: [cairo] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCity = vi.fn();
    render(<Harness onCity={onCity} />);

    fireEvent.change(screen.getByRole("combobox", { name: /Country of birth/ }), {
      target: { value: "EG" },
    });
    await act(async () => {});
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/geo/cities?country=EG&limit=1");
    const city = screen.getByRole("combobox", { name: /City of birth/ }) as HTMLInputElement;
    expect(city.value).toBe("Cairo, Egypt");
    expect(screen.getByText(/preselected the capital/)).toBeTruthy();

    // Typing over the preselected city keeps every typed character.
    vi.useFakeTimers();
    fireEvent.change(city, { target: { value: "A" } });
    expect(city.value).toBe("A");
    expect(onCity).toHaveBeenLastCalledWith(null);
    fireEvent.change(city, { target: { value: "Alex" } });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    fireEvent.click(screen.getByRole("option", { name: /Alexandria/ }));
    expect(onCity).toHaveBeenLastCalledWith(alexandria);
    expect(city.value).toBe("Alexandria, Egypt");
  });

  it("does not preselect a city for multi-time-zone countries", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness onCity={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Country of birth/ }), {
      target: { value: "US" },
    });
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("combobox", { name: /City of birth/ }) as HTMLInputElement).value,
    ).toBe("");
  });
});
