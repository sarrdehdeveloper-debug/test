import "../fonts";
import "../globals.css";
import "./admin.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/**
 * Root layout of the admin dashboard (outside the locale routing; src/proxy.ts skips /admin).
 * English UI, never indexed. Pages are client-rendered against /api/v1/admin with the session cookie.
 */
export const metadata: Metadata = {
  title: { default: "Admin · Zodiac Blend", template: "%s · Zodiac Blend Admin" },
  description: "Zodiac Blend administration",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "same-origin",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0E1726",
  colorScheme: "light",
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-scroll-behavior="smooth">
      <body className="admin-root bg-[#f8f5ee] text-ink antialiased">{children}</body>
    </html>
  );
}
