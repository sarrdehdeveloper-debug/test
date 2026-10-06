// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { Checkbox } from "./Checkbox";
import { Combobox } from "./Combobox";
import { DateInput } from "./DateInput";
import { Field } from "./Field";
import { Input } from "./Input";

type City = { id: number; label: string };
const CITIES: City[] = [
  { id: 1, label: "Cairo, Egypt" },
  { id: 2, label: "Alexandria, Egypt" },
  { id: 3, label: "Giza, Egypt" },
];

function wrap(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeAll(() => {
  // jsdom lacks scrollIntoView (used to keep the active option visible).
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Field", () => {
  it("wires label, hint, error and required state to the control", () => {
    render(
      <Field
        label="Email address"
        hint="We'll send it here."
        error="Please enter a valid email."
        required
      >
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText(/Email address/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.hasAttribute("required")).toBe(true);
    const describedBy = (input.getAttribute("aria-describedby") ?? "").split(" ");
    const texts = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(["Please enter a valid email.", "We'll send it here."]);
  });

  it("keeps date inputs left-to-right", () => {
    render(
      <Field label="Date of birth">
        <DateInput min="1900-01-01" />
      </Field>,
    );
    const input = screen.getByLabelText("Date of birth");
    expect(input.getAttribute("type")).toBe("date");
    expect(input.getAttribute("dir")).toBe("ltr");
  });

  it("labels checkboxes and links their errors", () => {
    render(<Checkbox label="I accept" error="Please accept." />);
    const box = screen.getByLabelText("I accept");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(box.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Please accept.",
    );
  });
});

describe("Combobox", () => {
  function setup() {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const loadOptions = vi.fn(async (query: string) =>
      CITIES.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    );
    // Combobox is controlled: the parent owns the selected city.
    function CityField() {
      const [city, setCity] = useState<City | null>(null);
      return (
        <Field label="City of birth">
          <Combobox<City>
            value={city}
            onChange={(next) => {
              onChange(next);
              setCity(next);
            }}
            loadOptions={loadOptions}
            getOptionKey={(c) => c.id}
            getOptionLabel={(c) => c.label}
            debounceMs={200}
          />
        </Field>
      );
    }
    render(wrap(<CityField />));
    const input = screen.getByRole("combobox", { name: "City of birth" });
    return { input, onChange, loadOptions };
  }

  async function flush() {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }

  it("opens with ArrowDown, loads options and selects with Enter", async () => {
    const { input, onChange, loadOptions } = setup();
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    await flush();
    expect(loadOptions).toHaveBeenCalledWith("", expect.any(AbortSignal));
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toBe("3 results available");

    // First option active; move to the second.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant");
    expect(document.getElementById(active ?? "")?.textContent).toBe("Alexandria, Egypt");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(CITIES[1]);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect((input as HTMLInputElement).value).toBe("Alexandria, Egypt");
  });

  it("debounces typing and announces empty results", async () => {
    const { input, loadOptions } = setup();
    fireEvent.change(input, { target: { value: "Gi" } });
    fireEvent.change(input, { target: { value: "Giz" } });
    await flush();
    expect(loadOptions).toHaveBeenCalledTimes(1);
    expect(loadOptions).toHaveBeenLastCalledWith("Giz", expect.any(AbortSignal));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Giza, Egypt"]);

    fireEvent.change(input, { target: { value: "Zzz" } });
    await flush();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No matches found.")).toBeTruthy();
  });

  it("closes with Escape and shows an error message when loading fails", async () => {
    vi.useFakeTimers();
    render(
      wrap(
        <Combobox<City>
          id="city"
          value={null}
          onChange={() => {}}
          loadOptions={() => Promise.reject(new Error("down"))}
          getOptionKey={(c) => c.id}
          getOptionLabel={(c) => c.label}
        />,
      ),
    );
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    await flush();
    expect(screen.getByRole("listbox").textContent).toContain("We couldn't load the list.");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});
