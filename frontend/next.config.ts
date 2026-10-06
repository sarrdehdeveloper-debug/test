import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Where the FastAPI backend lives. The browser never calls it directly: `/api/*` on the Next.js
 * origin is proxied there (see `rewrites`). Server Components call it directly (src/lib/api/server.ts).
 *
 * NOTE: rewrites are resolved at BUILD time for `output: "standalone"`, so API_BASE_URL must be set
 * when running `next build` (the Dockerfile takes it as a build arg, default http://api:8000), and
 * again at run time for Server Components. src/proxy.ts normalises X-Forwarded-For on /api/*.
 */
const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy without nonces (pages are statically rendered / ISR), see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md ("Without Nonces").
 * - No third-party scripts: Stripe Checkout is a top-level navigation, not an embedded script.
 * - `form-action` allows Stripe because a form submission that is redirected to Checkout is
 *   checked against `form-action` in Chromium.
 * - `img-src https:`: the CMS accepts absolute https image URLs (offers, blog covers, books);
 *   uploaded media is same-origin (/api/v1/media/...). Images cannot run code.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Ignored by browsers on plain-HTTP origins (local dev / docker on localhost).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // app/global-not-found.tsx renders unmatched URLs (our root layout lives under [locale]).
    globalNotFound: true,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_BASE_URL}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
