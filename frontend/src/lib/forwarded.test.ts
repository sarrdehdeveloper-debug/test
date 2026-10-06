import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor, isPlausibleIp, trustedProxyHops } from "./forwarded";

describe("clientIpFromForwardedFor", () => {
  it("uses the address Next.js filled in when the client sent none", () => {
    expect(clientIpFromForwardedFor("203.0.113.7", 0)).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor("::ffff:127.0.0.1", 0)).toBe("::ffff:127.0.0.1");
  });

  it("ignores client-supplied entries left of the trusted proxies", () => {
    // Browser sent "6.6.6.6"; one trusted proxy appended the real address.
    expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.7", 1)).toBe("203.0.113.7");
    // CDN + nginx: "<spoof>, <client>, <cdn edge>".
    expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.7, 198.51.100.2", 2)).toBe("203.0.113.7");
    // Fewer entries than hops: leftmost available.
    expect(clientIpFromForwardedFor("203.0.113.7", 3)).toBe("203.0.113.7");
  });

  it("returns null for missing or malformed values", () => {
    expect(clientIpFromForwardedFor(null, 0)).toBeNull();
    expect(clientIpFromForwardedFor(" , ", 1)).toBeNull();
    expect(clientIpFromForwardedFor("evil.example.com", 0)).toBeNull();
    expect(clientIpFromForwardedFor("999.1.1.1", 0)).toBeNull();
  });
});

describe("helpers", () => {
  it("validates IP literals", () => {
    expect(isPlausibleIp("10.0.0.1")).toBe(true);
    expect(isPlausibleIp("2001:db8::1")).toBe(true);
    expect(isPlausibleIp("unknown")).toBe(false);
    expect(isPlausibleIp("1.2.3")).toBe(false);
  });

  it("parses TRUSTED_PROXY_HOPS", () => {
    expect(trustedProxyHops(undefined)).toBe(0);
    expect(trustedProxyHops("")).toBe(0);
    expect(trustedProxyHops("-1")).toBe(0);
    expect(trustedProxyHops("2")).toBe(2);
    expect(trustedProxyHops("99")).toBe(10);
  });
});
