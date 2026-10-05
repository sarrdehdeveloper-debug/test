/** Public site URL (absolute links, Open Graph, sitemap). Set SITE_URL in production. */
export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Primary navigation (labels: messages `nav.<key>`). Hrefs are locale-less (see src/i18n/navigation.ts). */
export const MAIN_NAV = [
  { key: "home", href: "/" },
  { key: "free", href: "/free" },
  { key: "reading", href: "/reading" },
  { key: "offers", href: "/offers" },
  { key: "library", href: "/library" },
  { key: "blog", href: "/blog" },
] as const;

export const LEGAL_NAV = [
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
  { key: "contact", href: "/contact" },
] as const;

export type NavKey = (typeof MAIN_NAV)[number]["key"] | (typeof LEGAL_NAV)[number]["key"];

/** localStorage key holding the access token of an order (see docs/ARCHITECTURE.md). */
export const orderTokenStorageKey = (orderId: string) => `zb_order_${orderId}`;
