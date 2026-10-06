import { intlLocale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";

/**
 * Date helpers for offers and articles. API datetimes are UTC; like `formatDate` (src/lib/format.ts)
 * everything is shown in UTC so server and browser render the same day.
 */

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 1 – 31, 2026" / "1–31 أكتوبر 2026" (shared parts are not repeated). */
export function formatDateRange(
  start: string | Date,
  end: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return formatDate(a ?? b, locale, options);
  try {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", ...options });
    return fmt.formatRange(a, b);
  } catch {
    return `${formatDate(a, locale, options)} – ${formatDate(b, locale, options)}`;
  }
}

/** Which validity sentence an offer needs, from its optional start and end. */
export type OfferWindow =
  | { kind: "open" }
  | { kind: "from"; start: string }
  | { kind: "until"; end: string }
  | { kind: "between"; start: string; end: string };

export function offerWindow(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): OfferWindow {
  const start = toDate(startsAt) ? (startsAt as string) : null;
  const end = toDate(endsAt) ? (endsAt as string) : null;
  if (start && end) return { kind: "between", start, end };
  if (end) return { kind: "until", end };
  if (start) return { kind: "from", start };
  return { kind: "open" };
}

/** True when an offer ends within `days` days from `now` (and has not ended yet). */
export function endsSoon(
  endsAt: string | null | undefined,
  now: Date = new Date(),
  days = 7,
): boolean {
  const end = toDate(endsAt);
  if (!end) return false;
  const ms = end.getTime() - now.getTime();
  return ms > 0 && ms <= days * 24 * 60 * 60 * 1000;
}

/** `YYYY-MM-DD` of an ISO datetime (for `<time dateTime>` on date-only displays). */
export function isoDay(value: string | null | undefined): string | undefined {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : undefined;
}
