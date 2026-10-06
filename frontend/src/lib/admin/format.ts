/**
 * Formatting helpers for the admin dashboard (English UI, the admin's own time zone).
 * All are pure and safe with null/invalid input (they return "—" or "" as documented).
 */

const DASH = "—";
const LOCALE = "en-GB"; // "6 Oct 2026, 14:05" — unambiguous day/month order, 24-hour clock

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 2900, "USD" → "$29.00". Unknown currency codes fall back to "29.00 XYZ". */
export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return DASH;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** 1234567 → "1,234,567". */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return new Intl.NumberFormat("en-US").format(value);
}

/** ISO → "6 Oct 2026, 14:05" in the browser's time zone ("—" when empty). */
export function formatDateTime(
  value: string | Date | null | undefined,
  options: { seconds?: boolean; timeZone?: string } = {},
): string {
  const date = toDate(value);
  if (!date) return DASH;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: options.seconds ? "2-digit" : undefined,
    hour12: false,
    timeZone: options.timeZone,
  }).format(date);
}

/** ISO / Date / epoch ms → "14:05" in the browser's time zone ("—" when empty). */
export function formatTime(
  value: string | number | Date | null | undefined,
  options: { seconds?: boolean } = {},
): string {
  const date = toDate(value);
  if (!date) return DASH;
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: options.seconds ? "2-digit" : undefined,
    hour12: false,
  }).format(date);
}

/** ISO → "6 Oct 2026" ("—" when empty). Plain `YYYY-MM-DD` dates are shown as is (no TZ shift). */
export function formatDate(
  value: string | Date | null | undefined,
  options: { timeZone?: string } = {},
): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDate(new Date(`${value}T00:00:00Z`), { timeZone: "UTC" });
  }
  const date = toDate(value);
  if (!date) return DASH;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: options.timeZone,
  }).format(date);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", "in 4 h" (relative to `now`). */
export function formatRelative(
  value: string | Date | null | undefined,
  now: Date | number = Date.now(),
): string {
  const date = toDate(value);
  if (!date) return DASH;
  const diff = date.getTime() - (typeof now === "number" ? now : now.getTime());
  const abs = Math.abs(diff);
  const future = diff > 0;
  const wrap = (text: string) => (future ? `in ${text}` : `${text} ago`);
  if (abs < 45_000) return future ? "in a moment" : "just now";
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return wrap(`${minutes} min`);
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return wrap(`${hours} h`);
  const days = Math.round(abs / 86_400_000);
  if (days < 30) return wrap(days === 1 ? "1 day" : `${days} days`);
  return formatDate(date);
}

/** 61 → "1 minute", 45 → "45 seconds", 3720 → "1 hour 2 minutes", 7200 → "2 hours". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return plural(seconds, "second");
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${plural(hours, "hour")} ${plural(rest, "minute")}` : plural(hours, "hour");
}

/** 1536 → "1.5 KB", 5242880 → "5 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return DASH;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** "generation_failed" → "Generation failed", "send_report_email" → "Send report email". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** First 8 characters of a UUID, for compact tables ("3f9a1c2e"). */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : DASH;
}

/** "Dev Owner" → "DO", "editor@x.test" → "E". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/* ------------------------------------------------------------------ <input type="datetime-local"> */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * ISO UTC → value for `<input type="datetime-local">` in the browser's time zone
 * ("2026-10-06T14:05"). Empty/invalid → "".
 */
export function isoToLocalInput(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return "";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * `datetime-local` value (local time) → ISO UTC string ("2026-10-06T12:05:00.000Z").
 * Empty → null; invalid → undefined (lets forms tell "cleared" from "bad input").
 */
export function localInputToIso(value: string | null | undefined): string | null | undefined {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d, h, mi, Number.isNaN(s) ? 0 : s || 0);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return undefined;
  }
  return date.toISOString();
}

/** The browser's IANA time zone ("Europe/Berlin"), or "UTC" when unknown. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/* ------------------------------------------------------------------ money inputs */

/** 2950 → "29.50" (for an input field; no currency symbol or grouping). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${pad(abs % 100)}`;
}

/**
 * "29.5" → 2950, "1,234.56" → 123456, "" → null, "abc" / "1.234" (3 decimals) → undefined.
 * Negative amounts are rejected (undefined) unless `allowNegative`.
 */
export function parseMoneyInput(
  value: string,
  options: { allowNegative?: boolean } = {},
): number | null | undefined {
  const text = value.trim().replace(/[\s,]/g, "");
  if (!text) return null;
  const match = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) return undefined;
  const [, minus, whole, fraction = ""] = match;
  if (minus && !options.allowNegative) return undefined;
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return undefined;
  return minus ? -cents : cents;
}
