import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Uploaded images (blog covers, offers, books) stay crawlable: the longest match wins.
        allow: ["/", "/api/v1/media/"],
        // API, dashboard and the private, token-protected pages of every locale.
        disallow: ["/api/", "/admin", "/*/order/", "/*/report/", "/*/checkout/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
