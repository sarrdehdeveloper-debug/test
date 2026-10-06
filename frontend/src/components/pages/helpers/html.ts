/**
 * Small, dependency-free helpers for the sanitised HTML the API sends (`*_html` fields rendered
 * from Markdown by the backend). Pure functions: safe in Server Components, tests and the sitemap.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/** Decode the HTML entities a sanitiser emits (`&amp;`, `&#39;`, `&#x2019;`, `&nbsp;` ...). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** HTML -> plain text: tags removed, block boundaries become spaces, whitespace collapsed. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|li|h[1-6]|blockquote|tr|td|th|pre|div)>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Shorten text to at most `max` characters on a word boundary, adding an ellipsis. */
export function truncateText(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, Math.max(0, max - 1));
  // Cut on the last space unless the cut already ends a word.
  const atBoundary = /\s/.test(clean.charAt(cut.length));
  const lastSpace = cut.lastIndexOf(" ");
  const base = atBoundary || lastSpace <= max * 0.6 ? cut : cut.slice(0, lastSpace);
  return `${base.replace(/[\s.,;:!?،؛-]+$/u, "")}…`;
}

/** Plain-text summary of API HTML for meta descriptions (default 160 characters). */
export function htmlSummary(html: string | null | undefined, max = 160): string {
  return truncateText(htmlToText(html), max);
}

// "+1-307-443-6533", "(307) 443 6533", "00 44 20 7946 0958": at least 7 digits with separators.
const PHONE_LIKE = /(^|[^\w+(])(\+?\(?\d[\d\s().-]{5,}\d)/g;

/**
 * Phone numbers inside right-to-left text are reordered by the bidi algorithm
 * ("+1-307-443-6533" shows as "6533-443-307-1+"). Wrap number runs found in the text of API
 * HTML in `<bdi dir="ltr">` so they read left to right; tags and attributes are left untouched.
 */
export function isolateLtrNumbers(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part) =>
      part.startsWith("<")
        ? part
        : part.replace(PHONE_LIKE, (match, before: string, run: string) =>
            (run.match(/\d/g)?.length ?? 0) >= 7 ? `${before}<bdi dir="ltr">${run}</bdi>` : match,
          ),
    )
    .join("");
}
