import { describe, expect, it } from "vitest";
import { isExternalUrl } from "./format";
import { toSiteHref } from "./links";

describe("toSiteHref", () => {
  it("keeps site-relative paths locale-less (the locale-aware <Link> adds the current locale)", () => {
    // The seeded launch offer uses cta_url "/reading".
    expect(toSiteHref("/reading")).toBe("/reading");
    expect(toSiteHref("/reading?code=WELCOME10")).toBe("/reading?code=WELCOME10");
    expect(toSiteHref("reading")).toBe("/reading");
  });

  it("strips a locale prefix so the visitor stays in their language", () => {
    expect(toSiteHref("/en/reading")).toBe("/reading");
    expect(toSiteHref("/ar/blog/my-post#top")).toBe("/blog/my-post#top");
    expect(toSiteHref("/ar")).toBe("/");
    expect(toSiteHref("/en?x=1")).toBe("/?x=1");
    // Not a locale prefix:
    expect(toSiteHref("/english")).toBe("/english");
  });

  it("returns external URLs unchanged and uses the fallback for empty values", () => {
    expect(toSiteHref("https://shop.example.com/book")).toBe("https://shop.example.com/book");
    expect(toSiteHref(null, "/offers")).toBe("/offers");
    expect(toSiteHref("   ")).toBe("/");
  });
});

describe("isExternalUrl", () => {
  it("detects absolute, protocol-relative, mailto and tel URLs", () => {
    expect(isExternalUrl("https://x.y")).toBe(true);
    expect(isExternalUrl("HTTP://x.y")).toBe(true);
    expect(isExternalUrl("//x.y")).toBe(true);
    expect(isExternalUrl("mailto:a@b.c")).toBe(true);
    expect(isExternalUrl("tel:+1")).toBe(true);
    expect(isExternalUrl("/free")).toBe(false);
  });
});
