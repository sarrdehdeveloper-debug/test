import type { Catalog } from "./i18n/catalog";
import type { routing } from "./i18n/routing";

// Type-safe next-intl: message keys are checked against the English catalog (see i18n/catalog.ts).
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: Catalog;
  }
}
