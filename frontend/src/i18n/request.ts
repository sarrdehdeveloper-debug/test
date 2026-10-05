import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "./routing";

/**
 * The locale comes from the `[locale]` root segment via `next/root-params` (keeps pages static).
 * Root params are unavailable in Route Handlers / Server Actions, and outside `[locale]`
 * (e.g. a future /admin root layout); there we fall back to the locale header set by the proxy,
 * then to the default locale. Pass `{locale}` explicitly to getTranslations() in those places.
 */
async function readRootLocale(): Promise<string | undefined> {
  try {
    return await rootLocale();
  } catch {
    return undefined;
  }
}

export default getRequestConfig(async (params) => {
  // `params.requestLocale` is a lazy getter that reads request headers (dynamic rendering):
  // only touch it when neither an explicit locale nor a root param is available.
  const candidate = params.locale ?? (await readRootLocale()) ?? (await params.requestLocale);
  const locale = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
