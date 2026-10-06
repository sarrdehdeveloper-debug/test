import { describe, expect, it } from "vitest";
import { endsSoon, formatDateRange, isoDay, offerWindow } from "./dates";
import { decodeEntities, htmlSummary, htmlToText, isolateLtrNumbers, truncateText } from "./html";
import { MAX_PAGE, pageCount, pageHref, paginationItems, parsePageParam } from "./pagination";
import { countWords, readingMinutes } from "./reading-time";
import { absoluteUrl, articleJsonLd, isValidSlug, serializeJsonLd, shareLinks } from "./seo";
import { resolveLegalBody } from "./legal";
import { slugifyHeading, withHeadingAnchors } from "./toc";

describe("html", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("Tom &amp; Jerry &#39;x&#39; &#x2019; &nbsp;&lt;b&gt;")).toBe(
      "Tom & Jerry 'x' \u2019 \u00a0<b>",
    );
    expect(decodeEntities("&unknown; &#99999999;")).toBe("&unknown; &#99999999;");
  });

  it("turns HTML into plain text with spaces between blocks", () => {
    expect(htmlToText("<h2>Title</h2><p>One<br>two &amp; <strong>three</strong></p>")).toBe(
      "Title One two & three",
    );
    expect(htmlToText(null)).toBe("");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    expect(truncateText("short", 10)).toBe("short");
    expect(truncateText("The quick brown fox jumps over the lazy dog", 20)).toBe(
      "The quick brown fox\u2026",
    );
    expect(truncateText("The quick brown fox jumps over the lazy dog", 22)).toBe(
      "The quick brown fox\u2026",
    );
    expect(truncateText("Supercalifragilistic word", 10)).toBe("Supercali\u2026");
    expect(htmlSummary("<p>Hello, world.</p>", 160)).toBe("Hello, world.");
  });

  it("isolates phone numbers in RTL text without touching tags or short numbers", () => {
    expect(isolateLtrNumbers("<li><strong>الهاتف:</strong> +1-307-443-6533</li>")).toBe(
      '<li><strong>الهاتف:</strong> <bdi dir="ltr">+1-307-443-6533</bdi></li>',
    );
    expect(isolateLtrNumbers('<a href="tel:+13074436533">(307) 443 6533</a>')).toBe(
      '<a href="tel:+13074436533"><bdi dir="ltr">(307) 443 6533</bdi></a>',
    );
    expect(isolateLtrNumbers("<p>Suite 581, Wyoming 82001, 2026 – 30 days</p>")).toBe(
      "<p>Suite 581, Wyoming 82001, 2026 – 30 days</p>",
    );
  });
});

describe("toc", () => {
  it("slugifies Latin and Arabic headings", () => {
    expect(slugifyHeading("1. What we collect")).toBe("1-what-we-collect");
    expect(slugifyHeading("Cookies & local storage")).toBe("cookies-local-storage");
    expect(slugifyHeading("9. حقوقك")).toBe("9-حقوقك");
    expect(slugifyHeading("What's new?")).toBe("whats-new");
    expect(slugifyHeading("!!!")).toBe("");
  });

  it("adds unique ids to h2 headings and lists them", () => {
    const { html, toc } = withHeadingAnchors(
      "<p>Intro</p><h2>1. Data</h2><p>x</p><h3>Detail</h3><h2>1. Data</h2><h2><em>Rights</em> &amp; duties</h2>",
    );
    expect(toc).toEqual([
      { id: "1-data", text: "1. Data", level: 2 },
      { id: "1-data-2", text: "1. Data", level: 2 },
      { id: "rights-duties", text: "Rights & duties", level: 2 },
    ]);
    expect(html).toContain('<h2 id="1-data">1. Data</h2>');
    expect(html).toContain('<h2 id="1-data-2">1. Data</h2>');
    expect(html).toContain("<h3>Detail</h3>");
  });

  it("keeps existing ids, avoids reserved ids and handles symbol-only headings", () => {
    const { html, toc } = withHeadingAnchors(
      '<h2 id="keep">Kept</h2><h2>Main</h2><h2>***</h2><h2></h2>',
      { reserved: ["main"], levels: [2] },
    );
    expect(toc.map((e) => e.id)).toEqual(["keep", "main-2", "section-3"]);
    expect(html).toContain('<h2 id="keep">Kept</h2>');
    expect(html).toContain("<h2></h2>");
  });

  it("supports h3 when asked", () => {
    const { toc } = withHeadingAnchors("<h2>A</h2><h3>B</h3>", { levels: [2, 3] });
    expect(toc).toEqual([
      { id: "a", text: "A", level: 2 },
      { id: "b", text: "B", level: 3 },
    ]);
  });
});

describe("reading time", () => {
  it("counts words, Han characters and ignores punctuation-only tokens", () => {
    expect(countWords("one two  three")).toBe(3);
    expect(countWords("BaZi (八字) means — eight characters")).toBe(6);
    expect(countWords("")).toBe(0);
  });

  it("estimates whole minutes per locale, at least one", () => {
    const words = (n: number) => `<p>${Array.from({ length: n }, () => "word").join(" ")}</p>`;
    expect(readingMinutes("", "en")).toBe(1);
    expect(readingMinutes(words(230), "en")).toBe(1);
    expect(readingMinutes(words(231), "en")).toBe(2);
    expect(readingMinutes(words(900), "ar")).toBe(5);
    expect(readingMinutes(words(440), "fr")).toBe(2);
  });
});

describe("pagination", () => {
  it("parses ?page values strictly", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("3")).toBe(3);
    for (const bad of ["0", "-1", "2.5", "abc", "01", "", " 2"]) {
      expect(parsePageParam(bad)).toBeNull();
    }
    expect(parsePageParam(["1", "2"])).toBeNull();
    expect(parsePageParam(String(MAX_PAGE))).toBe(MAX_PAGE);
    expect(parsePageParam(String(MAX_PAGE + 1))).toBeNull();
  });

  it("computes the page count", () => {
    expect(pageCount(0, 9)).toBe(1);
    expect(pageCount(9, 9)).toBe(1);
    expect(pageCount(10, 9)).toBe(2);
    expect(pageCount(27, 9)).toBe(3);
  });

  it("lists every page when there are few", () => {
    expect(paginationItems(1, 1)).toEqual([1]);
    expect(paginationItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses long ranges into gaps with a constant number of items", () => {
    expect(paginationItems(1, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
    expect(paginationItems(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
    expect(paginationItems(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(paginationItems(7, 10)).toEqual([1, "gap", 6, 7, 8, 9, 10]);
    expect(paginationItems(10, 10)).toEqual([1, "gap", 6, 7, 8, 9, 10]);
    for (let page = 1; page <= 30; page++) expect(paginationItems(page, 30)).toHaveLength(7);
    // a gap always stands for at least two pages
    for (let page = 1; page <= 12; page++) {
      const items = paginationItems(page, 12);
      items.forEach((item, i) => {
        if (item !== "gap") return;
        expect((items[i + 1] as number) - (items[i - 1] as number)).toBeGreaterThan(2);
      });
    }
  });

  it("clamps out-of-range pages", () => {
    expect(paginationItems(99, 10)).toEqual(paginationItems(10, 10));
    expect(paginationItems(0, 10)).toEqual(paginationItems(1, 10));
  });

  it("builds canonical page hrefs", () => {
    expect(pageHref("/blog", 1)).toBe("/blog");
    expect(pageHref("/blog", 3)).toBe("/blog?page=3");
  });
});

describe("dates", () => {
  it("formats ranges per locale in UTC", () => {
    // Intl puts thin spaces around the dash; compare with plain spaces.
    const plain = (s: string) => s.replace(/[\u2009\u202f\u00a0]/g, " ");
    expect(plain(formatDateRange("2026-10-01T00:00:00Z", "2026-10-31T23:00:00Z", "en"))).toBe(
      "Oct 1 – 31, 2026",
    );
    expect(plain(formatDateRange("2026-10-01", "2026-11-15", "en"))).toBe("Oct 1 – Nov 15, 2026");
    const ar = formatDateRange("2026-10-01", "2026-11-15", "ar");
    expect(ar).toMatch(/1/);
    expect(ar).toMatch(/15/);
    expect(ar).not.toMatch(/[٠-٩]/);
    expect(formatDateRange("bad", "2026-11-15", "en")).toBe("Nov 15, 2026");
  });

  it("chooses the validity sentence", () => {
    expect(offerWindow(null, null)).toEqual({ kind: "open" });
    expect(offerWindow("2026-10-01T00:00:00Z", null)).toEqual({
      kind: "from",
      start: "2026-10-01T00:00:00Z",
    });
    expect(offerWindow(null, "2026-10-31T00:00:00Z")).toEqual({
      kind: "until",
      end: "2026-10-31T00:00:00Z",
    });
    expect(offerWindow("2026-10-01", "2026-10-31")).toEqual({
      kind: "between",
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(offerWindow("garbage", undefined)).toEqual({ kind: "open" });
  });

  it("detects offers that end soon", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(endsSoon("2026-10-10T00:00:00Z", now)).toBe(true);
    expect(endsSoon("2026-10-20T00:00:00Z", now)).toBe(false);
    expect(endsSoon("2026-10-01T00:00:00Z", now)).toBe(false);
    expect(endsSoon(null, now)).toBe(false);
  });

  it("extracts the ISO day", () => {
    expect(isoDay("2026-10-06T12:32:25.400003Z")).toBe("2026-10-06");
    expect(isoDay(null)).toBeUndefined();
  });
});

describe("seo", () => {
  it("escapes JSON-LD so it cannot close the script element", () => {
    const json = serializeJsonLd({ headline: "</script><script>alert(1)</script> & \u2028" });
    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
    expect(json).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(json)).toEqual({ headline: "</script><script>alert(1)</script> & \u2028" });
  });

  it("resolves absolute URLs", () => {
    expect(absoluteUrl("/en/blog/x", "https://zodiacblend.com/")).toBe(
      "https://zodiacblend.com/en/blog/x",
    );
    expect(absoluteUrl("https://cdn.example.com/a.png", "https://zodiacblend.com")).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("describes an article", () => {
    const ld = articleJsonLd({
      url: "https://zodiacblend.com/en/blog/x",
      headline: "Title",
      description: "Desc",
      datePublished: "2026-10-06T12:00:00Z",
      authorName: "Zodiac Blend",
      publisherName: "Zodiac Blend",
      publisherLogo: "https://zodiacblend.com/brand/logo.png",
      inLanguage: "en",
    });
    expect(ld["@type"]).toBe("Article");
    expect(ld.author).toEqual({ "@type": "Organization", name: "Zodiac Blend" });
    expect(ld.datePublished).toBe("2026-10-06T12:00:00Z");
    expect(ld).not.toHaveProperty("image");
    const person = articleJsonLd({
      url: "u",
      headline: "T",
      authorName: "Lina",
      publisherName: "Zodiac Blend",
      publisherLogo: "l",
      inLanguage: "ar",
      image: "https://x/y.png",
    });
    expect(person.author).toEqual({ "@type": "Person", name: "Lina" });
    expect(person.image).toEqual(["https://x/y.png"]);
  });

  it("builds encoded share links", () => {
    const links = shareLinks("https://zodiacblend.com/en/blog/a b", "Two & one");
    expect(links.map((l) => l.network)).toEqual(["x", "facebook", "whatsapp", "linkedin", "email"]);
    expect(links[0].href).toBe(
      "https://x.com/intent/post?url=https%3A%2F%2Fzodiacblend.com%2Fen%2Fblog%2Fa%20b&text=Two%20%26%20one",
    );
    expect(links[4].href.startsWith("mailto:?subject=Two%20%26%20one&body=")).toBe(true);
  });

  it("validates slugs", () => {
    expect(isValidSlug("what-is-bazi-2")).toBe(true);
    for (const bad of ["a", "Upper", "with space", "../etc", "x".repeat(161), "ar-عربي"]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});

describe("legal body", () => {
  const notice = "Our privacy policy is temporarily unavailable. Write to info@zodiacblend.com.";

  it("shows the notice when the API is down", () => {
    const body = resolveLegalBody({
      fromApi: false,
      html: `<p>${notice}</p>`,
      fallbackText: notice,
    });
    expect(body).toEqual({ available: false, html: `<p>${notice}</p>` });
  });

  it("shows the notice when the API value is empty (accessor fell back to the default)", () => {
    const body = resolveLegalBody({
      fromApi: true,
      html: `<p>${notice}</p>`,
      fallbackText: notice,
    });
    expect(body.available).toBe(false);
    expect(resolveLegalBody({ fromApi: true, html: "", fallbackText: notice })).toEqual({
      available: false,
      html: `<p>${notice}</p>`,
    });
  });

  it("anchors the h2 headings of a real policy", () => {
    const body = resolveLegalBody({
      fromApi: true,
      html: "<p><em>Last updated: October 2026</em></p><h2>1. What we collect</h2><p>x</p><h2>2. Why</h2>",
      fallbackText: notice,
      reservedIds: ["main"],
    });
    expect(body.available).toBe(true);
    if (!body.available) return;
    expect(body.toc.map((e) => e.id)).toEqual(["1-what-we-collect", "2-why"]);
    expect(body.html).toContain('<h2 id="2-why">2. Why</h2>');
  });
});
