import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for the public site. Every public URL starts with the locale (`/en/...`, `/ar/...`);
 * `/` is redirected by src/proxy.ts using the NEXT_LOCALE cookie or Accept-Language.
 * The admin dashboard (`/admin`) is outside of this routing.
 */
export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

/** Per-locale presentation data. Add a locale here AND in `routing.locales` AND messages/<locale>.json. */
export const LOCALE_META: Record<
  AppLocale,
  { label: string; dir: "ltr" | "rtl"; intl: string; og: string }
> = {
  en: { label: "English", dir: "ltr", intl: "en-US", og: "en_US" },
  // Latin digits keep numbers consistent with native date/time inputs and backend strings.
  ar: { label: "العربية", dir: "rtl", intl: "ar-u-nu-latn", og: "ar_AR" },
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}

export function localeDir(locale: string): "ltr" | "rtl" {
  return isAppLocale(locale) ? LOCALE_META[locale].dir : "ltr";
}

/** BCP-47 tag for `Intl.*` formatters (e.g. Arabic with Latin digits). */
export function intlLocale(locale: string): string {
  return isAppLocale(locale) ? LOCALE_META[locale].intl : LOCALE_META[routing.defaultLocale].intl;
}
