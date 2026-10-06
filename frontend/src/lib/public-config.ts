import { cache } from "react";
import { apiGet } from "./api/server";
import { CACHE_TAGS } from "./api/tags";
import type { PublicConfig } from "./types";

/** Used when GET /public-config is unavailable (keep in sync with backend settings defaults). */
export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  locales: ["en", "ar"],
  default_locale: "en",
  paid_price_cents: 2900,
  currency: "USD",
  report_access_hours: 24,
  payment_provider: "stripe",
  min_birth_date: "1900-01-01",
};

/** Public business settings (price, currency, access window...). Never null: falls back to defaults. */
export const getPublicConfig = cache(async (): Promise<PublicConfig & { fromApi: boolean }> => {
  const data = await apiGet<PublicConfig>("/public-config", {
    revalidate: 300,
    tags: [CACHE_TAGS.publicConfig],
  });
  return data
    ? { ...DEFAULT_PUBLIC_CONFIG, ...data, fromApi: true }
    : { ...DEFAULT_PUBLIC_CONFIG, fromApi: false };
});
