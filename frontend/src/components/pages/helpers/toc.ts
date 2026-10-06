import { htmlToText } from "./html";

/**
 * Table of contents for long API HTML (legal pages, articles): gives each heading a stable,
 * unique `id` and returns the list of headings for an "On this page" navigation.
 *
 *   const { html, toc } = withHeadingAnchors(content.html("legal.terms.body"));
 *   // html: `<h2 id="1-what-we-offer">1. What we offer</h2>…`, toc: [{ id, text, level: 2 }]
 */

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export interface HeadingAnchorOptions {
  /** Heading levels that get an id and a TOC entry (default: h2 only). */
  levels?: readonly number[];
  /** Ids already used on the page (e.g. "main"), never generated again. */
  reserved?: readonly string[];
  /** Prefix for headings whose text has no letters or digits (default "section"). */
  fallbackPrefix?: string;
}

// Built with the RegExp constructor: `\p{…}` needs the `u` flag (ES2018) and tsconfig targets ES2017.
const NON_WORD = new RegExp("[^\\p{L}\\p{M}\\p{N}]+", "gu");

/**
 * "1. What we collect" -> "1-what-we-collect"; Arabic letters are kept ("١. حقوقك" -> "١-حقوقك"),
 * which is valid in HTML ids and URL fragments (browsers percent-encode them).
 */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(NON_WORD, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const HEADING_RE = /<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1\s*>/gi;
const ID_ATTR_RE = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

export function withHeadingAnchors(
  html: string,
  options: HeadingAnchorOptions = {},
): { html: string; toc: TocEntry[] } {
  const levels = new Set(options.levels ?? [2]);
  const used = new Set(options.reserved ?? []);
  const prefix = options.fallbackPrefix ?? "section";
  const toc: TocEntry[] = [];
  let index = 0;

  const unique = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  const out = html.replace(
    HEADING_RE,
    (match, levelText: string, attrs: string | undefined, inner: string) => {
      const level = Number(levelText);
      if (!levels.has(level)) return match;
      index += 1;
      const text = htmlToText(inner);
      if (!text) return match;
      const existing = attrs?.match(ID_ATTR_RE);
      const existingId = existing ? (existing[1] ?? existing[2] ?? existing[3]) : undefined;
      if (existingId) {
        used.add(existingId);
        toc.push({ id: existingId, text, level });
        return match;
      }
      const id = unique(slugifyHeading(text) || `${prefix}-${index}`);
      toc.push({ id, text, level });
      return `<h${level} id="${id}"${attrs ?? ""}>${inner}</h${level}>`;
    },
  );

  return { html: out, toc };
}
