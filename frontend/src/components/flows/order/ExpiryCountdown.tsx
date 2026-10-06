"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { msUntilNextTick, remainingUntil } from "@/lib/flows/countdown";
import { formatDate } from "@/lib/format";

/**
 * "Link active for 23h 12m" + the local expiry date/time. Re-renders when the displayed minute
 * changes; calls `onExpired` once the link has expired (the parent re-fetches the order).
 */
export function ExpiryCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired?: () => void;
}) {
  const t = useTranslations("order.ready");
  const locale = useLocale();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const remaining = remainingUntil(expiresAt, current);
      if (!remaining) return;
      if (remaining.expired) onExpired?.();
      else timer = setTimeout(tick, msUntilNextTick(remaining));
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [expiresAt, onExpired]);

  const remaining = now === null ? null : remainingUntil(expiresAt, now);
  // Local time zone of the visitor (formatDate defaults to UTC for plain dates).
  const until = formatDate(expiresAt, locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: undefined,
  });

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-gold-light/30 bg-white/[0.05] px-4 py-1 text-sm font-medium text-ivory">
        <HourglassIcon />
        <span className="tabular-nums">
          {remaining && !remaining.expired
            ? remaining.hours === 0
              ? t("activeForMinutes", { minutes: remaining.minutes })
              : remaining.minutes === 0
                ? t("activeForHours", { hours: remaining.hours })
                : t("activeFor", { hours: remaining.hours, minutes: remaining.minutes })
            : " "}
        </span>
      </p>
      <p className="text-xs text-mist">{t("until", { date: until })}</p>
    </div>
  );
}

function HourglassIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4 shrink-0 text-gold-light"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 3h9M5.5 17h9M6.5 3c0 4 7 4 7 7s-7 3-7 7M13.5 3c0 4-7 4-7 7s7 3 7 7" />
    </svg>
  );
}
