import { intlLocale } from "@/i18n/routing";

/** 2900 + "USD" -> "$29" (en) / "‏29 US$" (ar). Cents are shown only when non-zero. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency}`;
  }
}

/** ISO date/datetime -> localized date ("October 5, 2026" / "5 أكتوبر 2026"). */
export function formatDate(
  value: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "long" },
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", ...options }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** True for absolute http(s) URLs and protocol-relative URLs. */
export function isExternalUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url) || /^(mailto|tel):/i.test(url);
}
