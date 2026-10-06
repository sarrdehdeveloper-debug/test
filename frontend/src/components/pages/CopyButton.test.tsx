// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeShareButton } from "@/components/blog/NativeShareButton";
import { CopyButton, copyToClipboard } from "./CopyButton";

const labels = {
  label: "Copy code SAVE10",
  copiedLabel: "Code copied",
  failedLabel: "Copy failed",
};

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  Object.defineProperty(document, "execCommand", { value: undefined, configurable: true });
});

async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("CopyButton", () => {
  it("copies the value and announces success politely, then resets", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<CopyButton value="SAVE10" {...labels} />);

    const button = screen.getByRole("button", { name: "Copy code SAVE10" });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    await click(button);
    expect(writeText).toHaveBeenCalledWith("SAVE10");
    expect(status.textContent).toBe("Code copied");
    expect(status.getAttribute("aria-live")).toBe("polite");

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(status.textContent).toBe("");
  });

  it("copies the current page URL without the hash when no value is given", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    window.history.replaceState(null, "", "/en/blog/post?x=1#section");
    render(
      <CopyButton variant="pill" label="Copy link" copiedLabel="Link copied" failedLabel="No" />,
    );

    await click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/en/blog/post?x=1`);
    expect(screen.getByRole("status").textContent).toBe("Link copied");
  });

  it("falls back to execCommand when the Clipboard API is refused", async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    await expect(copyToClipboard("abc")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("announces a failure when nothing can copy", async () => {
    Object.defineProperty(document, "execCommand", {
      value: () => {
        throw new Error("unsupported");
      },
      configurable: true,
    });
    render(<CopyButton value="SAVE10" {...labels} />);
    await click(screen.getByRole("button", { name: "Copy code SAVE10" }));
    expect(screen.getByRole("status").textContent).toBe("Copy failed");
  });
});

describe("NativeShareButton", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("renders nothing without the Web Share API", () => {
    const { container } = render(<NativeShareButton title="Post" label="Share" />);
    expect(container.innerHTML).toBe("");
  });

  it("opens the share sheet with the page URL when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    window.history.replaceState(null, "", "/ar/blog/post#top");
    render(<NativeShareButton title="Post" label="Share" />);
    await click(screen.getByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith({
      title: "Post",
      url: `${window.location.origin}/ar/blog/post`,
    });
  });
});
