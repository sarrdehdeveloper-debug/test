// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

// The locale-aware Link needs the Next.js router; render a plain anchor with the locale prefix.
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => {
    delete rest.prefetch;
    return (
      <a href={`/en${href === "/" ? "" : href}`} {...rest}>
        {children}
      </a>
    );
  },
}));

afterEach(cleanup);

describe("Button", () => {
  it("renders internal hrefs as locale-aware links", () => {
    render(<Button href="/free">Free reading</Button>);
    const link = screen.getByRole("link", { name: "Free reading" });
    expect(link.getAttribute("href")).toBe("/en/free");
  });

  it("renders external hrefs as plain anchors", () => {
    render(
      <Button href="https://books.example.com" variant="outline">
        Buy
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Buy" }).getAttribute("href")).toBe(
      "https://books.example.com",
    );
  });

  it("renders a type=button by default and disables it while loading", () => {
    const { rerender } = render(<Button>Send</Button>);
    const button = screen.getByRole("button", { name: "Send" });
    expect(button.getAttribute("type")).toBe("button");
    rerender(
      <Button type="submit" loading>
        Send
      </Button>,
    );
    expect(button.getAttribute("type")).toBe("submit");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});

describe("feedback", () => {
  it("announces errors assertively and other alerts politely", () => {
    render(
      <>
        <Alert tone="error">Failed</Alert>
        <Alert tone="success">Saved</Alert>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Failed");
    expect(screen.getByRole("status").textContent).toContain("Saved");
  });

  it("gives labelled spinners a status role and hides decorative ones", () => {
    const { container } = render(
      <>
        <Spinner label="Loading…" />
        <Spinner />
      </>,
    );
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(container.querySelectorAll('svg[aria-hidden="true"][data-spinner]')).toHaveLength(2);
  });
});
