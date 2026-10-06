"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { INITIAL_SNAPSHOT, OrderPoller, type PollSnapshot } from "@/lib/flows/polling";
import type { OrderStatusOut } from "@/lib/types";

/**
 * Polls GET /orders/{id} with the browser token (see OrderPoller in src/lib/flows/polling.ts for
 * the schedule). Pauses while the tab is hidden. `refresh()` fetches immediately.
 */
export function useOrderStatus(
  orderId: string,
  token: string | null | undefined,
  awaitingConfirmation: boolean,
): { snapshot: PollSnapshot; refresh: () => void } {
  const [snapshot, setSnapshot] = useState<PollSnapshot>(INITIAL_SNAPSHOT);
  const pollerRef = useRef<OrderPoller | null>(null);

  useEffect(() => {
    if (!token) return;
    const poller = new OrderPoller({
      fetchStatus: (signal) =>
        api.get<OrderStatusOut>(`/orders/${encodeURIComponent(orderId)}`, {
          headers: { "X-Order-Token": token },
          signal,
        }),
      onChange: setSnapshot,
      awaitingConfirmation,
    });
    pollerRef.current = poller;
    poller.start();
    const onVisibility = () => poller.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      poller.stop();
      pollerRef.current = null;
    };
  }, [orderId, token, awaitingConfirmation]);

  const refresh = useCallback(() => pollerRef.current?.refresh(), []);
  return { snapshot, refresh };
}
