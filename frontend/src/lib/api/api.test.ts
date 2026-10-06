import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import {
  ambiguousTimeOptions,
  ApiError,
  discountErrorReason,
  localizedErrorCode,
  parseApiError,
  suggestedTime,
} from "./errors";
import { apiGet, apiGetResult, serverApiBaseUrl } from "./server";
import { apiPath } from "./shared";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("apiPath", () => {
  it("prefixes /api/v1 and serialises the query, skipping empty values", () => {
    expect(apiPath("/blog", { page: 2, locale: "ar", q: "", x: null, y: undefined })).toBe(
      "/api/v1/blog?page=2&locale=ar",
    );
    expect(apiPath("geo/cities", { banner: true })).toBe("/api/v1/geo/cities?banner=true");
    expect(apiPath("/api/v1/offers")).toBe("/api/v1/offers");
  });
});

describe("parseApiError", () => {
  it("reads the contract error body", async () => {
    const err = await parseApiError(
      jsonResponse(
        {
          error: {
            code: "validation_error",
            message: "Invalid",
            details: { fields: [{ field: "email", message: "bad", type: "value_error" }] },
          },
        },
        422,
      ),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("validation_error");
    expect(err.fieldErrorMap()).toEqual({ email: "bad" });
  });

  it("maps non-JSON responses to synthetic codes and reads Retry-After", async () => {
    const limited = await parseApiError(
      new Response("slow down", { status: 429, headers: { "Retry-After": "30" } }),
    );
    expect(limited.code).toBe("rate_limited");
    expect(limited.isRateLimited).toBe(true);
    expect(limited.retryAfter).toBe(30);
    expect((await parseApiError(new Response("", { status: 502 }))).code).toBe("server_error");
    expect((await parseApiError(new Response("", { status: 404 }))).isNotFound).toBe(true);
    expect((await parseApiError(new Response("", { status: 400 }))).code).toBe("http_error");
  });

  it("exposes typed details for order errors", () => {
    const ambiguous = new ApiError(422, "ambiguous_local_time", "", {
      options: [{ fold: 0, utc_offset_minutes: 180, label: "01:30 (UTC+03:00)" }],
    });
    expect(ambiguousTimeOptions(ambiguous)).toHaveLength(1);
    expect(
      suggestedTime(new ApiError(422, "nonexistent_local_time", "", { suggested_time: "03:30" })),
    ).toBe("03:30");
    expect(
      discountErrorReason(new ApiError(422, "invalid_discount_code", "", { reason: "expired" })),
    ).toBe("expired");
    expect(
      discountErrorReason(new ApiError(422, "invalid_discount_code", "", { reason: "weird" })),
    ).toBeNull();
    expect(localizedErrorCode("rate_limited")).toBe("rate_limited");
    expect(localizedErrorCode("something_new")).toBe("generic");
  });
});

describe("server apiGet", () => {
  it("calls API_BASE_URL directly with the locale and returns JSON", async () => {
    vi.stubEnv("API_BASE_URL", "http://api.internal:8000/");
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const data = await apiGet<{ items: unknown[] }>("/offers", {
      locale: "ar",
      query: { banner: true },
    });
    expect(data).toEqual({ items: [] });
    expect(serverApiBaseUrl()).toBe("http://api.internal:8000");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { next?: unknown },
    ];
    expect(url).toBe("http://api.internal:8000/api/v1/offers?banner=true&locale=ar");
    expect(init.next).toEqual({ revalidate: 60 });
  });

  it("never throws: API down, timeouts and HTTP errors give null", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    expect(await apiGet("/site-content", { locale: "en" })).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "not_found", message: "x", details: {} } }, 404),
      ),
    );
    const result = await apiGetResult("/blog/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200 })),
    );
    expect(await apiGet("/public-config")).toBeNull();
  });

  it("opts out of the data cache with revalidate 0", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await apiGet("/public-config", { revalidate: 0, tags: ["x"] });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.cache).toBe("no-store");
  });
});

describe("client apiRequest", () => {
  it("uses relative /api/v1 URLs, JSON bodies and same-origin credentials", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ order_id: "1" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const out = await apiRequest<{ order_id: string }>("/orders", {
      method: "POST",
      body: { email: "a@b.c" },
      headers: { "X-Order-Token": "t" },
    });
    expect(out.order_id).toBe("1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/orders");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe('{"email":"a@b.c"}');
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-order-token")).toBe("t");
  });

  it("throws ApiError for error responses and network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "rate_limited", message: "", details: {} } }, 429),
      ),
    );
    await expect(apiRequest("/free-reading", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(apiRequest("/geo/countries")).rejects.toMatchObject({
      code: "network",
      status: 0,
    });
  });
});
