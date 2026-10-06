import { htmlToText } from "./html";

/**
 * Average silent-reading speeds for non-fiction (words per minute). Arabic words carry more
 * letters and clitics, so fewer of them are read per minute.
 */
export const WORDS_PER_MINUTE: Record<string, number> = { en: 230, ar: 180 };
const DEFAULT_WPM = 220;

// Han characters (e.g. 八字 in the BaZi articles) are read one by one, like short words.
const HAN = new RegExp("\\p{Script=Han}", "gu");
const HAS_WORD_CHAR = new RegExp("[\\p{L}\\p{N}]", "u");

/** Number of words in plain text (whitespace-separated tokens + individual Han characters). */
export function countWords(text: string): number {
  const han = text.match(HAN)?.length ?? 0;
  const rest = text.replace(HAN, " ").trim();
  const words = rest ? rest.split(/\s+/).filter((w) => HAS_WORD_CHAR.test(w)).length : 0;
  return words + han;
}

/** Estimated reading time of API HTML in whole minutes (at least 1). */
export function readingMinutes(html: string | null | undefined, locale: string): number {
  const words = countWords(htmlToText(html));
  const wpm = WORDS_PER_MINUTE[locale] ?? DEFAULT_WPM;
  return Math.max(1, Math.ceil(words / wpm));
}
