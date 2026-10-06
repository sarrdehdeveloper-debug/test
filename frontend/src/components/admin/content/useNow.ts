"use client";

import { useEffect, useState } from "react";

/**
 * Current time (epoch ms), refreshed every `intervalMs` (default 1 minute), for render-time
 * comparisons such as "scheduled vs published" without calling `Date.now()` during render.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
