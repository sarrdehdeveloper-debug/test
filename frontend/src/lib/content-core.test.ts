import { describe, expect, it } from "vitest";
import { createContentAccessor, escapeHtml, splitLines, textToHtml } from "./content-core";

const defaults = {
  home: {
    hero: { title: "Default title", eyebrow: "Default eyebrow" },
    plans: { free: { features: "One\nTwo\n\n Three " } },
  },
  legal: { privacy: { body: "Line <b>one</b>\nline two\n\nSecond paragraph" } },
};

describe("createContentAccessor", () => {
  it("prefers non-empty API values, then message defaults, then the fallback argument", () => {
    const c = createContentAccessor(
      "en",
      { items: { "home.hero.title": "From the API", "home.hero.eyebrow": "   " }, html: {} },
      defaults,
    );
    expect(c.fromApi).toBe(true);
    expect(c.t("home.hero.title")).toBe("From the API");
    // Blank API value -> bundled default.
    expect(c.t("home.hero.eyebrow")).toBe("Default eyebrow");
    // Missing everywhere -> fallback argument, else "".
    expect(c.t("home.hero.subtitle", "Fallback")).toBe("Fallback");
    expect(c.t("home.hero.subtitle")).toBe("");
  });

  it("works without the API (null source)", () => {
    const c = createContentAccessor("ar", null, defaults);
    expect(c.fromApi).toBe(false);
    expect(c.locale).toBe("ar");
    expect(c.t("home.hero.title")).toBe("Default title");
  });

  it("splits `lines` keys into trimmed, non-empty items", () => {
    const c = createContentAccessor("en", null, defaults);
    expect(c.lines("home.plans.free.features")).toEqual(["One", "Two", "Three"]);
    expect(c.lines("home.plans.paid.features", ["x"])).toEqual(["x"]);
  });

  it("returns API html for markdown keys and escapes plain-text defaults", () => {
    const withApi = createContentAccessor(
      "en",
      { items: {}, html: { "legal.privacy.body": "<p>Policy</p>" } },
      defaults,
    );
    expect(withApi.html("legal.privacy.body")).toBe("<p>Policy</p>");

    const offline = createContentAccessor("en", null, defaults);
    expect(offline.html("legal.privacy.body")).toBe(
      "<p>Line &lt;b&gt;one&lt;/b&gt;<br>line two</p><p>Second paragraph</p>",
    );
    expect(offline.html("legal.terms.body")).toBe("");
  });
});

describe("text helpers", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("turns text into paragraphs", () => {
    expect(textToHtml("a\nb\n\n\nc")).toBe("<p>a<br>b</p><p>c</p>");
    expect(textToHtml("   ")).toBe("");
  });

  it("splits lines across CRLF", () => {
    expect(splitLines("a\r\nb\n")).toEqual(["a", "b"]);
  });
});
