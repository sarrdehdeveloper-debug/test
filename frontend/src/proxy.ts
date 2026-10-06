import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { clientIpFromForwardedFor, trustedProxyHops } from "./lib/forwarded";

/**
 * Next.js 16 "proxy" (formerly middleware), Node.js runtime.
 *
 * 1. Public pages: locale detection + redirect (`/` -> `/en` or `/ar` from the NEXT_LOCALE cookie /
 *    Accept-Language) by next-intl.
 * 2. `/api/*` (proxied to FastAPI by the rewrite in next.config.ts): replace X-Forwarded-For with
 *    the single client address the API should rate-limit on (see src/lib/forwarded.ts and the
 *    TRUSTED_PROXY_HOPS env var), and drop X-Real-IP, which the API would otherwise trust.
 */
const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/")) {
    const headers = new Headers(request.headers);
    const ip = clientIpFromForwardedFor(
      headers.get("x-forwarded-for"),
      trustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
    );
    if (ip) headers.set("x-forwarded-for", ip);
    else headers.delete("x-forwarded-for");
    headers.delete("x-real-ip");
    return NextResponse.next({ request: { headers } });
  }
  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    // The API proxy (all of it, including file names with dots such as /api/v1/media/x.webp).
    "/api/:path*",
    // Pages: skip the admin dashboard (outside the locale routing), Next internals and files.
    "/((?!api(?:/|$)|admin(?:/|$)|_next|_vercel|.*\\..*).*)",
  ],
};
