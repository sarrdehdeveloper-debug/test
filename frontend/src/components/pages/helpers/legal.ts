import { textToHtml } from "@/lib/content-core";
import { withHeadingAnchors, type TocEntry } from "./toc";

export type LegalBody =
  { available: true; html: string; toc: TocEntry[] } | { available: false; html: string };

/**
 * Decide how to show a legal text (`legal.privacy.body`, `legal.terms.body`).
 * The bundled message default of these keys is a "temporarily unavailable" notice rather than a
 * possibly outdated policy, so when the API is down or the value is empty we show that notice
 * (as a notice, without a table of contents); otherwise the document gets heading anchors.
 */
export function resolveLegalBody(input: {
  /** Whether /site-content answered. */
  fromApi: boolean;
  /** `content.html(key)`: API HTML, or the escaped message default. */
  html: string;
  /** The message default (`content.<key>`), i.e. the unavailable notice text. */
  fallbackText: string;
  reservedIds?: readonly string[];
}): LegalBody {
  const { fromApi, html, fallbackText, reservedIds } = input;
  const isFallback = !html.trim() || html === textToHtml(fallbackText);
  if (!fromApi || isFallback) {
    return { available: false, html: html.trim() ? html : textToHtml(fallbackText) };
  }
  const anchored = withHeadingAnchors(html, { levels: [2], reserved: reservedIds });
  return { available: true, html: anchored.html, toc: anchored.toc };
}
