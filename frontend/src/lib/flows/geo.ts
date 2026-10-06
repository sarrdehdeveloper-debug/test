import type { Country } from "@/lib/types";

/** Slim country shape passed from the server page to the order form (small HTML payload). */
export interface CountryOption {
  code: string;
  name: string;
  /** The country has exactly one time zone: its capital is preselected. */
  singleZone: boolean;
  capitalId: number | null;
}

export function toCountryOption(country: Country): CountryOption {
  return {
    code: country.code,
    name: country.name,
    singleZone: country.timezones.length === 1,
    capitalId: country.capital_city_id,
  };
}
