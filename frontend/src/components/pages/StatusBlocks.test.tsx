// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Breadcrumbs } from "./Breadcrumbs";
import { EmptyState, UnavailableNotice } from "./StatusBlocks";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/en${href === "/" ? "" : href}`} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("UnavailableNotice", () => {
  it("offers a full reload of the same page (locale-prefixed, not re-prefixed)", () => {
    render(
      <UnavailableNotice
        title="Temporarily unavailable"
        body="Please try again."
        retryHref="/ar/blog?page=2"
        retryLabel="Try again"
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Temporarily unavailable" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(
      "/ar/blog?page=2",
    );
  });

  it("renders the bundled notice HTML", () => {
    const { container } = render(
      <UnavailableNotice
        title="Temporarily unavailable"
        bodyHtml="<p>Write to <strong>info@zodiacblend.com</strong>.</p>"
        retryHref="/en/privacy"
        retryLabel="Try again"
      />,
    );
    expect(container.querySelector(".prose-zb strong")?.textContent).toBe("info@zodiacblend.com");
  });
});

describe("EmptyState", () => {
  it("shows a heading, body and actions", () => {
    render(
      <EmptyState
        title="No offers at the moment"
        body="Come back soon."
        headingLevel="h3"
        actions={<button type="button">Free reading</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "No offers at the moment" })).toBeTruthy();
    expect(screen.getByText("Come back soon.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Free reading" })).toBeTruthy();
  });
});

describe("Breadcrumbs", () => {
  it("links every crumb but the current page", () => {
    render(
      <Breadcrumbs
        label="Breadcrumb"
        items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: "Post" }]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Blog" }).getAttribute("href")).toBe("/en/blog");
    expect(screen.getByText("Post").getAttribute("aria-current")).toBe("page");
  });
});
