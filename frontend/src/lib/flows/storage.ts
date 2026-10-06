import { orderTokenStorageKey } from "@/lib/site";

/**
 * Order access tokens live in localStorage["zb_order_<id>"] (docs/ARCHITECTURE.md §5). Storage can
 * be unavailable (private mode, blocked cookies, quota): every access is guarded.
 */

export const ORDER_TOKEN_EVENT = "zb:order-token";

export function saveOrderToken(orderId: string, token: string): boolean {
  try {
    window.localStorage.setItem(orderTokenStorageKey(orderId), token);
    window.dispatchEvent(new Event(ORDER_TOKEN_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function readOrderToken(orderId: string): string | null {
  try {
    const value = window.localStorage.getItem(orderTokenStorageKey(orderId));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/** Subscribe to token changes (other tabs via `storage`, this tab via ORDER_TOKEN_EVENT). */
export function subscribeOrderToken(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(ORDER_TOKEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ORDER_TOKEN_EVENT, onChange);
  };
}
