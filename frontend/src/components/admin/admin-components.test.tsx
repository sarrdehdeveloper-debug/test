// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminMutation, useAdminQuery } from "@/lib/admin/hooks";
import { clearToasts, getToasts } from "@/lib/admin/toast";
import type { OfferTranslation, Translations } from "@/lib/admin/types";

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};
let pathname = "/admin";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- test double
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));

import { AdminAuthProvider } from "./AdminAuthProvider";
import { AdminShell } from "./AdminShell";
import { ConfirmDialog } from "./ConfirmDialog";
import { DataTable } from "./DataTable";
import { MoneyInput } from "./MoneyInput";
import { Pagination } from "./Pagination";
import { qrPath } from "./QrCode";
import { StatusBadge, statusStyle } from "./StatusBadge";
import { TranslationTabs } from "./TranslationTabs";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeAll(() => {
  // jsdom lacks the modal dialog API.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  pathname = "/admin";
  Object.values(router).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  cleanup();
  clearToasts();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ badges, tables, pagination */

describe("StatusBadge", () => {
  it("labels and colours API statuses", () => {
    render(
      <>
        <StatusBadge status="generation_failed" />
        <StatusBadge status="awaiting_payment" />
        <StatusBadge kind="job" status="running" />
        <StatusBadge kind="active" status={false} />
      </>,
    );
    expect(screen.getByText("Generation failed")).toBeTruthy();
    expect(screen.getByText("Awaiting payment")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(statusStyle("order", "ready").tone).toBe("success");
    expect(statusStyle("job", "running").pulse).toBe(true);
    expect(statusStyle("order", "brand_new_status")).toMatchObject({
      tone: "neutral",
      label: "Brand new status",
    });
  });
});

describe("DataTable", () => {
  const columns = [
    { id: "name", header: "Name", cell: (r: { id: number; name: string }) => r.name },
    {
      id: "act",
      header: "Actions",
      srOnlyHeader: true,
      cell: () => <button type="button">Edit</button>,
    },
  ];

  it("shows a skeleton, then the empty state", () => {
    const { rerender, container } = render(
      <DataTable
        caption="Offers"
        columns={columns}
        rows={undefined}
        loading
        getRowId={(r) => r.id}
      />,
    );
    expect(container.querySelector("table")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
    rerender(
      <DataTable
        caption="Offers"
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        emptyTitle="No offers yet"
      />,
    );
    expect(screen.getByText("No offers yet")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Offers" })).toBeTruthy();
  });

  it("links rows and navigates on row click, but not from inner controls", () => {
    render(
      <DataTable
        caption="Offers"
        columns={columns}
        rows={[{ id: 7, name: "Spring" }]}
        getRowId={(r) => r.id}
        rowHref={(r) => `/admin/offers/${r.id}`}
      />,
    );
    expect(screen.getByRole("link", { name: "Spring" }).getAttribute("href")).toBe(
      "/admin/offers/7",
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("row")[1]);
    expect(router.push).toHaveBeenCalledWith("/admin/offers/7");
  });

  it("renders an error state with retry", () => {
    const retry = vi.fn();
    render(
      <DataTable
        caption="Offers"
        columns={columns}
        rows={undefined}
        getRowId={(r) => r.id}
        error={new Error("boom")}
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("Pagination", () => {
  it("summarises and changes pages", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={2}
        pageSize={20}
        total={132}
        onPageChange={onPageChange}
        itemLabel="orders"
      />,
    );
    expect(screen.getByRole("navigation", { name: "Pagination" }).textContent).toContain(
      "Showing 21–40 of 132 orders",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Page 7" }));
    expect(onPageChange).toHaveBeenLastCalledWith(7);
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});

/* ------------------------------------------------------------------ editors */

describe("TranslationTabs", () => {
  function Harness({ initial }: { initial: Translations<Partial<OfferTranslation>> }) {
    const [value, setValue] = useState(initial);
    return (
      <TranslationTabs<Partial<OfferTranslation>>
        value={value}
        onChange={setValue}
        fields={["title", "body"]}
        locales={["en", "ar"]}
      >
        {({ entry, set, fieldProps }) => (
          <label>
            Title
            <input
              {...fieldProps}
              value={entry.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
        )}
      </TranslationTabs>
    );
  }

  it("marks missing translations and edits the Arabic entry right-to-left", () => {
    render(<Harness initial={{ en: { title: "Spring", body: "Text" } }} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].textContent).toContain("(complete)");
    expect(tabs[1].textContent).toContain("(missing translation)");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Not translated yet/)).toBeTruthy();
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    expect(input.getAttribute("dir")).toBe("rtl");
    expect(input.getAttribute("lang")).toBe("ar");
    fireEvent.change(input, { target: { value: "ربيع" } });
    expect(screen.getAllByRole("tab")[1].textContent).toContain("(incomplete)");
    expect(screen.getByText(/Still empty in Arabic: body/)).toBeTruthy();
  });
});

describe("MoneyInput", () => {
  it("emits cents and flags invalid text", () => {
    const onChange = vi.fn();
    render(<MoneyInput value={2900} onChange={onChange} currency="USD" aria-label="Price" />);
    const input = screen.getByLabelText("Price") as HTMLInputElement;
    expect(input.value).toBe("29.00");
    fireEvent.change(input, { target: { value: "31.5" } });
    expect(onChange).toHaveBeenLastCalledWith(3150);
    fireEvent.change(input, { target: { value: "31.555" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter an amount like 29.00")).toBeTruthy();
  });
});

describe("ConfirmDialog", () => {
  it("requires the confirmation text and keeps the dialog open with the error on failure", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(() => Promise.reject(new Error("Network down")));
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete this offer?"
        confirmLabel="Delete"
        tone="danger"
        confirmText="spring"
      />,
    );
    const confirm = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "spring" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Network down"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes after a successful confirmation", async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={() => Promise.resolve()} title="Sure?" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("qrPath", () => {
  it("merges runs of dark modules per row", () => {
    expect(
      qrPath([
        [true, true, false, true],
        [false, false, false, false],
        [true, false, true, true],
      ]),
    ).toBe("M0 0h2v1h-2zM3 0h1v1h-1zM0 2h1v1h-1zM2 2h2v1h-2z");
  });
});

/* ------------------------------------------------------------------ hooks */

describe("useAdminQuery / useAdminMutation", () => {
  it("loads, exposes errors and refetches", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ error: { code: "server_error", message: "boom", details: {} } }, 500)
          : jsonResponse({ items: [1, 2], total: 2, page: 1, page_size: 20 });
      }),
    );
    const { result } = renderHook(() =>
      useAdminQuery<{ items: number[] }>("/orders", { query: { page: 1 } }),
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error?.code).toBe("server_error"));
    expect(result.current.loading).toBe(false);
    // refetch() resolves once the response is stored; don't await it inside act (act defers effects).
    act(() => {
      void result.current.refetch();
    });
    expect(result.current.fetching).toBe(true);
    await waitFor(() => expect(result.current.data?.items).toEqual([1, 2]));
    expect(result.current.error).toBeNull();
    expect(result.current.updatedAt).toBeTypeOf("number");
  });

  it("does not fetch when disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAdminQuery("/orders", { enabled: false }));
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toasts success and errors, never throwing from mutate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "slug_taken", message: "taken", details: {} } }, 409),
      ),
    );
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAdminMutation(
        (slug: string) =>
          fetch(`/x/${slug}`).then(async (r) => {
            if (!r.ok) {
              const { parseApiError } = await import("@/lib/api/errors");
              throw await parseApiError(r);
            }
            return r.json();
          }),
        { successMessage: "Saved", onError },
      ),
    );
    let value: unknown = "unset";
    await act(async () => {
      value = await result.current.mutate("spring");
    });
    expect(value).toBeUndefined();
    expect(result.current.error?.code).toBe("slug_taken");
    expect(onError).toHaveBeenCalled();
    expect(getToasts().map((t) => t.title)).toEqual([
      "This slug is already in use. Choose another one.",
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true })),
    );
    await act(async () => {
      await result.current.mutate("summer");
    });
    expect(result.current.error).toBeNull();
    expect(getToasts().some((t) => t.title === "Saved")).toBe(true);
  });
});

/* ------------------------------------------------------------------ auth + shell */

describe("AdminShell with AdminAuthProvider", () => {
  function renderShell() {
    return render(
      <AdminAuthProvider>
        <AdminShell>
          <p>Page content</p>
        </AdminShell>
      </AdminAuthProvider>,
    );
  }

  const user = (role: string) => ({
    user: {
      id: 9,
      email: `${role}@example.com`,
      name: `Dev ${role}`,
      role,
      mfa_enabled: false,
      last_login_at: null,
    },
  });

  it("shows the page and the role-filtered sidebar", async () => {
    pathname = "/admin/blog";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(user("editor"))),
    );
    renderShell();
    expect(await screen.findByText("Page content")).toBeTruthy();
    const nav = screen.getAllByRole("navigation", { name: "Dashboard" })[0];
    expect(nav.textContent).toContain("Blog");
    expect(nav.textContent).not.toContain("Orders");
    const active = screen.getAllByRole("link", { name: "Blog" })[0];
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it("blocks routes above the user's role", async () => {
    pathname = "/admin/orders";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(user("editor"))),
    );
    renderShell();
    expect(await screen.findByText("You don't have permission to view this")).toBeTruthy();
    expect(screen.queryByText("Page content")).toBeNull();
  });

  it("redirects to the login page on 401", async () => {
    pathname = "/admin/orders";
    window.history.replaceState(null, "", "/admin/orders?status=ready");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { code: "unauthorized", message: "Login required", details: {} } },
          401,
        ),
      ),
    );
    renderShell();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/admin/login?next=%2Fadmin%2Forders%3Fstatus%3Dready",
      ),
    );
    expect(screen.queryByText("Page content")).toBeNull();
  });
});
