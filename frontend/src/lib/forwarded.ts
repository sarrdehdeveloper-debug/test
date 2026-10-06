/**
 * Client IP for requests proxied to the API (`/api/*`, see src/proxy.ts). Pure; unit-tested.
 *
 * The backend rate-limits by the FIRST `X-Forwarded-For` entry, and Next.js forwards whatever the
 * browser sent, so the proxy replaces the header with exactly one trustworthy address:
 *
 * - `trustedHops = 0` (Next.js is the edge, e.g. docker compose on :3000): Next.js fills the header
 *   with the socket address when the client sent none; the LAST entry is used. A client that sends
 *   its own header can still choose this value: put a reverse proxy in front in production.
 * - `trustedHops = N` (N reverse proxies in front, each appending the address it saw, e.g. nginx
 *   `$proxy_add_x_forwarded_for`, Caddy, a load balancer): the N-th entry from the right is the
 *   address the outermost trusted proxy saw; entries further left are client-controlled.
 */
export function clientIpFromForwardedFor(
  header: string | null | undefined,
  trustedHops: number,
): string | null {
  const entries = (header ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const hops = Number.isFinite(trustedHops) && trustedHops > 0 ? Math.floor(trustedHops) : 1;
  // Fewer entries than trusted hops: the request skipped a proxy; use the leftmost we have.
  const candidate = entries[Math.max(0, entries.length - hops)];
  return isPlausibleIp(candidate) ? candidate : null;
}

/** IPv4 / IPv6 literal check (no DNS names, ports or garbage, max 64 chars like the backend). */
export function isPlausibleIp(value: string): boolean {
  if (value.length > 64) return false;
  if (/^(\d{1,3})(\.\d{1,3}){3}$/.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }
  return /^[0-9a-f:.]+$/i.test(value) && value.includes(":");
}

/** Parse the TRUSTED_PROXY_HOPS environment variable (default 0). */
export function trustedProxyHops(raw: string | undefined): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10) : 0;
}
