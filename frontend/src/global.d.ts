import type messages from "../messages/en.json";
import type { routing } from "./i18n/routing";

// Type-safe next-intl: message keys are checked against messages/en.json.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
