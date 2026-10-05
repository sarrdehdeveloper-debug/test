import type { ContentKey } from "./content-keys";

/**
 * Pure part of the site-content accessor (no Next.js imports, unit-tested).
 * Precedence for every key: API value (non-empty) -> messages default (`content.*`) -> fallback arg.
 */
export interface SiteContentAccessor {
  locale: string;
  /** Whether the API answered (false = everything comes from the bundled defaults). */
  fromApi: boolean;
  /** Plain text value. */
  t(key: ContentKey, fallback?: string): string;
  /** `lines` keys: one item per non-empty line. */
  lines(key: ContentKey, fallback?: string[]): string[];
  /**
   * Sanitised HTML for `markdown` keys (from the API). When the API has no value the bundled
   * default (plain text) is escaped and wrapped in <p> paragraphs.
   */
  html(key: ContentKey, fallback?: string): string;
}

export interface SiteContentSource {
  items?: Record<string, string> | null;
  html?: Record<string, string> | null;
}

function lookup(tree: unknown, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function nonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text -> safe HTML paragraphs (blank line = new paragraph, newline = <br>). */
export function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function createContentAccessor(
  locale: string,
  source: SiteContentSource | null,
  defaults: unknown,
): SiteContentAccessor {
  const items = source?.items ?? {};
  const html = source?.html ?? {};

  const text = (key: ContentKey, fallback = ""): string => {
    const fromApi = items[key];
    if (nonEmpty(fromApi)) return fromApi;
    const fromMessages = lookup(defaults, key);
    if (nonEmpty(fromMessages)) return fromMessages;
    return fallback;
  };

  return {
    locale,
    fromApi: source !== null,
    t: text,
    lines(key, fallback = []) {
      const value = text(key);
      return value ? splitLines(value) : fallback;
    },
    html(key, fallback = "") {
      const fromApi = html[key];
      if (nonEmpty(fromApi)) return fromApi;
      const value = text(key, fallback);
      return value ? textToHtml(value) : "";
    },
  };
}
