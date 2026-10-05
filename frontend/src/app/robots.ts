import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Private, token-protected pages are never indexed.
  const privatePaths = routing.locales.flatMap((l) => [`/${l}/order/`, `/${l}/report/`, `/${l}/checkout/`]);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", ...privatePaths] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
