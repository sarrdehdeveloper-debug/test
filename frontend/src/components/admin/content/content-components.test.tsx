// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentKey } from "@/lib/admin/types";
import { ContentKeyRow } from "./ContentKeyRow";
import { FormErrorAlert } from "./FormErrorAlert";
import { SaveBar } from "./SaveBar";
import { useUnsavedChanges } from "./useUnsavedChanges";

vi.mock("./revalidate", () => ({
  refreshPublicContent: vi.fn(async () => ({ ok: true, tags: [] })),
}));

afterEach(cleanup);

const KEY: ContentKey = {
  key: "home.hero.title",
  format: "text",
  group: "home",
  description: "Hero title",
};

describe("ContentKeyRow", () => {
  it("edits each locale with the right direction and flags untranslated values", () => {
    const onChange = vi.fn();
    render(
      <ContentKeyRow
        contentKey={KEY}
        locales={["en", "ar"]}
        defaultLocale="en"
        values={{ en: "Two Traditions. One Truth.", ar: "" }}
        saved={{ en: "Two Traditions. One Truth.", ar: "" }}
        onChange={onChange}
      />,
    );
    const arabic = screen.getByLabelText(/Arabic/);
    expect(arabic.getAttribute("dir")).toBe("rtl");
    expect(arabic.getAttribute("lang")).toBe("ar");
    expect(screen.getByText("Untranslated")).toBeTruthy();
    expect(screen.getByText(/Arabic visitors see the English text/)).toBeTruthy();
    fireEvent.change(arabic, { target: { value: "تقليدان" } });
    expect(onChange).toHaveBeenCalledWith("ar", "home.hero.title", "تقليدان");
  });

  it("marks edited values and reverts them", () => {
    const onChange = vi.fn();
    render(
      <ContentKeyRow
        contentKey={KEY}
        locales={["en", "ar"]}
        defaultLocale="en"
        values={{ en: "New title", ar: "عنوان" }}
        saved={{ en: "Old title", ar: "عنوان" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Unsaved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Revert English/ }));
    expect(onChange).toHaveBeenCalledWith("en", "home.hero.title", "Old title");
  });
});

describe("SaveBar and FormErrorAlert", () => {
  it("disables saving while clean and shows the status", () => {
    const onSave = vi.fn();
    const { rerender } = render(<SaveBar dirty={false} onSave={onSave} />);
    expect(screen.getByText("All changes saved")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    rerender(<SaveBar dirty onSave={onSave} status="2 unsaved changes" />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.getByText("2 unsaved changes")).toBeTruthy();
  });

  it("lists field errors", () => {
    render(<FormErrorAlert errors={{ slug: "Taken.", "translations.ar.title": "Add a title." }} />);
    expect(screen.getByRole("alert").textContent).toContain("Slug: Taken.");
    expect(screen.getByRole("alert").textContent).toContain("Arabic title: Add a title.");
  });
});

describe("useUnsavedChanges", () => {
  it("asks before following an in-app link while dirty", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const link = document.createElement("a");
    link.href = "/admin/offers";
    link.textContent = "Offers";
    document.body.appendChild(link);
    const followed = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", followed);

    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });
    link.click();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(followed).not.toHaveBeenCalled(); // stopped before reaching the link's handlers

    rerender({ dirty: false });
    link.click();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(followed).toHaveBeenCalledTimes(1);
    unmount();
    link.remove();
  });
});
