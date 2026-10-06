"use client";

import { useSyncExternalStore } from "react";
import { readOrderToken, subscribeOrderToken } from "@/lib/flows/storage";

const noopSubscribe = () => () => {};

/** False during the server render and hydration, true afterwards (no setState-in-effect). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function subscribeLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/**
 * A query parameter read on the client: `undefined` while hydrating (unknown yet), then the value
 * or null. Unlike `useSearchParams`, it does not opt the static page out of prerendering.
 */
export function useSearchParam(name: string): string | null | undefined {
  return useSyncExternalStore(
    subscribeLocation,
    () => new URLSearchParams(window.location.search).get(name),
    () => undefined,
  );
}

/** The order access token from localStorage: `undefined` while hydrating, then token or null. */
export function useOrderToken(orderId: string): string | null | undefined {
  return useSyncExternalStore(
    subscribeOrderToken,
    () => readOrderToken(orderId),
    () => undefined,
  );
}
