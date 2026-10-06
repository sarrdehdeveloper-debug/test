import { apiRequest } from "@/lib/api/client";
import { routing } from "@/i18n/routing";

/** File name offered for the downloaded PDF (matches the API's Content-Disposition). */
export const REPORT_FILE_NAME = "ZodiacBlend-Report.pdf";
const MAX_TOKEN_LENGTH = 256;

/**
 * Token of an email link: `/{locale}/report/{id}#t=<token>`. The fragment is never sent to a server;
 * the page reads it, removes it from the address bar and keeps it in memory only.
 */
export function parseReportToken(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = (params.get("t") ?? params.get("token") ?? "").trim();
  if (!token || token.length > MAX_TOKEN_LENGTH || /\s/.test(token)) return null;
  return token;
}

/** Our own pages a checkout URL may point at (fake checkout, order page for 0-amount orders). */
const OWN_FLOW_PATH = new RegExp(`^/(?:${routing.locales.join("|")})/(?:checkout/fake|order/)`);

/**
 * Where to send the browser after POST /orders or POST /orders/{id}/checkout.
 * URLs to our own flow pages are made relative to the current origin: the order token sits in
 * this origin's localStorage, and the API's configured site URL may differ in host or scheme
 * (e.g. localhost vs 127.0.0.1, www vs apex). External URLs (Stripe Checkout) are kept as is.
 */
export function resolveCheckoutUrl(url: string, currentOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, currentOrigin);
  } catch {
    return url;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return currentOrigin;
  if (parsed.origin === currentOrigin || OWN_FLOW_PATH.test(parsed.pathname)) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return parsed.toString();
}

/** GET /reports/{id}/download with the browser or email token; throws ApiError (404/409/410/429). */
export async function fetchReport(orderId: string, token: string): Promise<Blob> {
  const res = await apiRequest<Response>(`/reports/${encodeURIComponent(orderId)}/download`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
    raw: true,
  });
  return res.blob();
}

/** Save a blob through a temporary object URL and `<a download>`. */
export function saveBlob(blob: Blob, fileName: string = REPORT_FILE_NAME): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the blob before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
