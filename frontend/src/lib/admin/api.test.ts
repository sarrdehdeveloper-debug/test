import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_HEADER,
  AdminApiError,
  adminApi,
  adminPath,
  isAbortError,
  setUnauthorizedHandler,
  toAdminApiError,
} from "./api";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function errorBody(code: string, message = code, details: Record<string, unknown> = {}) {
  return { error: { code, message, details } };
}

function stubFetch(response: Response | (() => Response)) {
  const fetchMock = vi.fn(async () => (typeof response === "function" ? response() : response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminPath", () => {
  it("prefixes /api/v1/admin and keeps full /api paths", () => {
    expect(adminPath("/orders", { page: 2, status: "", q: undefined })).toBe(
      "/api/v1/admin/orders?page=2",
    );
    expect(adminPath("auth/me")).toBe("/api/v1/admin/auth/me");
    expect(adminPath("/api/v1/public-config")).toBe("/api/v1/public-config");
    expect(adminPath("/api/v1/admin/media?page=1", { page_size: 24 })).toBe(
      "/api/v1/admin/media?page=1&page_size=24",
    );
  });
});

describe("adminApi requests", () => {
  it("sends GETs without the admin header and parses JSON", async () => {
    const fetchMock = stubFetch(jsonResponse({ user: { id: 1 } }));
    const data = await adminApi.get<{ user: { id: number } }>("/auth/me");
    expect(data.user.id).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/auth/me");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).has(ADMIN_HEADER)).toBe(false);
  });

  it("adds X-ZB-Admin: 1 and a JSON body to every non-GET request", async () => {
    for (const method of ["post", "put", "patch"] as const) {
      const fetchMock = stubFetch(jsonResponse({ ok: true }));
      await adminApi[method]("/offers/1", { is_active: false });
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(headers.get(ADMIN_HEADER)).toBe("1");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init.body).toBe('{"is_active":false}');
    }
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await expect(adminApi.delete("/prompts/versions/3")).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get(ADMIN_HEADER)).toBe("1");
  });

  it("passes FormData through untouched", async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 1 }, 201));
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "image/png" }), "a.png");
    await adminApi.post("/media", form);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
});

describe("AdminApiError", () => {
  it("parses the backend error shape with field errors", async () => {
    stubFetch(
      jsonResponse(
        errorBody("validation_error", "Invalid input", {
          fields: [
            { field: "slug", message: "Use 2-120 characters", type: "value_error" },
            { field: "translations.en.title", message: "Field required", type: "missing" },
          ],
        }),
        422,
      ),
    );
    const err = await adminApi.post("/offers", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminApiError);
    const error = err as AdminApiError;
    expect(error.status).toBe(422);
    expect(error.code).toBe("validation_error");
    expect(error.isValidation).toBe(true);
    expect(error.fields).toEqual({
      slug: "Use 2-120 characters",
      "translations.en.title": "Field required",
    });
  });

  it("reads retry_after_seconds of a 429", async () => {
    stubFetch(
      jsonResponse(errorBody("rate_limited", "Too many", { retry_after_seconds: 840 }), 429, {
        "Retry-After": "840",
      }),
    );
    const error = (await adminApi
      .post("/auth/login", {}, { redirectOn401: false })
      .catch((e: unknown) => e)) as AdminApiError;
    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(840);
  });

  it("classifies 401/403 (login failures and CSRF are not session problems)", () => {
    expect(new AdminApiError(401, "unauthorized").isUnauthorized).toBe(true);
    expect(new AdminApiError(401, "invalid_credentials").isUnauthorized).toBe(false);
    expect(new AdminApiError(401, "mfa_required").isUnauthorized).toBe(false);
    expect(new AdminApiError(403, "forbidden").isForbidden).toBe(true);
    expect(new AdminApiError(403, "csrf_failed").isForbidden).toBe(false);
    expect(new AdminApiError(409, "slug_taken").isConflict).toBe(true);
  });

  it("maps network failures and unknown throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const err = (await adminApi.get("/dashboard").catch((e: unknown) => e)) as AdminApiError;
    expect(err).toBeInstanceOf(AdminApiError);
    expect(err.code).toBe("network");
    expect(toAdminApiError(new Error("boom")).code).toBe("client_error");
  });

  it("rethrows aborts as AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
    );
    const err = await adminApi.get("/dashboard").catch((e: unknown) => e);
    expect(isAbortError(err)).toBe(true);
  });
});

describe("401 handling", () => {
  it("calls the registered handler on 401 unless redirectOn401 is false", async () => {
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);
    stubFetch(() => jsonResponse(errorBody("unauthorized", "Login required"), 401));
    await adminApi.get("/orders").catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    await adminApi.get("/auth/me", { redirectOn401: false }).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    stubFetch(() => jsonResponse(errorBody("invalid_credentials"), 401));
    await adminApi.post("/auth/login", {}).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    unregister();
    stubFetch(() => jsonResponse(errorBody("unauthorized"), 401));
    await adminApi.get("/orders").catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
