/**
 * Time left on a report link ("link active for 23h 12m"). Minutes are rounded UP so the display
 * never shows "0m" while the link still works; it reaches zero exactly when the link expires.
 */
export interface Remaining {
  expired: boolean;
  /** Milliseconds left (0 when expired). */
  ms: number;
  hours: number;
  /** 0–59 */
  minutes: number;
}

export function remainingUntil(
  expiresAt: string | Date | null | undefined,
  now: number,
): Remaining | null {
  if (!expiresAt) return null;
  const end = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  if (Number.isNaN(end)) return null;
  const ms = Math.max(0, end - now);
  if (ms === 0) return { expired: true, ms: 0, hours: 0, minutes: 0 };
  const totalMinutes = Math.ceil(ms / 60_000);
  return {
    expired: false,
    ms,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/**
 * Delay until the displayed value changes (next whole-minute boundary of the remaining time),
 * so a countdown re-renders once a minute instead of every second. Never less than 1 s.
 */
export function msUntilNextTick(remaining: Remaining): number {
  if (remaining.expired) return 0;
  const intoMinute = remaining.ms % 60_000;
  return Math.max(1000, intoMinute === 0 ? 60_000 : intoMinute);
}
