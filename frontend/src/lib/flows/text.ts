/**
 * Wrap a left-to-right value (price, code, email, reference) in Unicode first-strong isolates
 * before interpolating it into a translated sentence, so "29 US$" or "a***@example.com" keep their
 * order inside Arabic text.
 */
export function bidiIsolate(value: string): string {
  return `⁨${value}⁩`;
}
