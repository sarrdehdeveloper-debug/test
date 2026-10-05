import type { Metadata } from "next";
import { LOCALE_META, routing, isAppLocale } from "@/i18n/routing";

export const OG_IMAGE = { url: "/brand/og-image.png", width: 1200, height: 630 } as const;

export interface PageMetadataInput {
  locale: string;
  /** Locale-less path of the page, e.g. "/" or "/blog/my-post". */
  path: string;
  title: string | { absolute: string };
  description?: string;
  /** Locales the page exists in (default: all). Blog posts pass `available_locales`. */
  locales?: readonly string[];
  images?: { url: string; width?: number; height?: number; alt?: string }[];
  type?: "website" | "article";
  /** Prevent indexing (order/report/checkout pages). */
  noIndex?: boolean;
}

function localizedPath(locale: string, path: string) {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/**
 * Per-page metadata with canonical URL, hreflang alternates (+ x-default), Open Graph and Twitter.
 * metadataBase (SITE_URL) is set in the root layout, so relative URLs are fine here.
 *
 *   export async function generateMetadata({ params }: PageProps<"/[locale]/free">) {
 *     const { locale } = await params;
 *     const c = await getSiteContent(locale);
 *     return pageMetadata({ locale, path: "/free", title: c.t("free.intro.title") });
 *   }
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const { locale, path, title, description, images, type = "website", noIndex } = input;
  const locales = (input.locales ?? routing.locales).filter(isAppLocale);
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = localizedPath(l, path);
  if (locales.includes(routing.defaultLocale)) {
    languages["x-default"] = localizedPath(routing.defaultLocale, path);
  }
  const ogLocale = isAppLocale(locale) ? LOCALE_META[locale].og : undefined;
  const ogTitle = typeof title === "string" ? title : title.absolute;
  const ogImages = images ?? [OG_IMAGE];

  return {
    title,
    description,
    alternates: { canonical: localizedPath(locale, path), languages },
    openGraph: {
      type,
      title: ogTitle,
      description,
      url: localizedPath(locale, path),
      locale: ogLocale,
      alternateLocale: locales.filter((l) => l !== locale).map((l) => LOCALE_META[l].og),
      images: ogImages,
    },
    twitter: { card: "summary_large_image", title: ogTitle, description, images: ogImages.map((i) => i.url) },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
