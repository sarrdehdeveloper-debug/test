import { routing } from "@/i18n/routing";
import { isExternalUrl } from "./format";

/**
 * Normalise a URL coming from the CMS/API for use with the locale-aware <Link>/<Button>:
 * external URLs are returned unchanged; "/en/reading" or "/ar/reading" become "/reading"
 * (the current locale is added back by <Link>); empty values use `fallback`.
 */
export function toSiteHref(url: string | null | undefined, fallback = "/"): string {
  if (!url || !url.trim()) return fallback;
  const value = url.trim();
  if (isExternalUrl(value)) return value;
  const path = value.startsWith("/") ? value : `/${value}`;
  for (const locale of routing.locales) {
    if (path === `/${locale}`) return "/";
    for (const sep of ["/", "?", "#"]) {
      if (path.startsWith(`/${locale}${sep}`)) {
        const rest = path.slice(locale.length + 1);
        return rest.startsWith("/") ? rest : `/${rest}`;
      }
    }
  }
  return path;
}
