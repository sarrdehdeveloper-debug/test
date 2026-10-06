import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
let cookieHeader = "zb_admin=token";

vi.mock("next/cache", () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => cookieHeader }),
}));

import { refreshPublicContent } from "./revalidate";

describe("refreshPublicContent (Server Action)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    revalidateTag.mockReset();
    fetchMock.mockReset();
    cookieHeader = "zb_admin=token";
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revalidates known tags for a signed-in admin", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await refreshPublicContent(["offers", "offers", "blog"]);
    expect(result).toEqual({ ok: true, tags: ["offers", "blog"] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/admin\/auth\/me$/);
    expect((init.headers as Record<string, string>).Cookie).toBe("zb_admin=token");
    expect(revalidateTag.mock.calls).toEqual([
      ["offers", "max"],
      ["blog", "max"],
    ]);
  });

  it("refuses unknown tags, missing cookies and invalid sessions", async () => {
    // @ts-expect-error -- untrusted input from the client
    expect(await refreshPublicContent(["evil"])).toEqual({ ok: false, tags: [] });
    cookieHeader = "";
    expect(await refreshPublicContent(["offers"])).toEqual({ ok: false, tags: [] });
    cookieHeader = "zb_admin=expired";
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await refreshPublicContent(["offers"])).toEqual({ ok: false, tags: [] });
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await refreshPublicContent(["offers"])).toEqual({ ok: false, tags: [] });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
