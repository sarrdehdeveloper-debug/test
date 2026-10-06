import arBase from "../../messages/ar.json";
import arFlows from "../../messages/ar/flows.json";
import arPages from "../../messages/ar/pages.json";
import enBase from "../../messages/en.json";
import enFlows from "../../messages/en/flows.json";
import enPages from "../../messages/en/pages.json";

/**
 * Message catalogs are split by area so features can be developed independently:
 *   messages/<locale>.json        shared UI (nav, forms, errors, zodiac names, home, content defaults)
 *   messages/<locale>/flows.json  free reading, paid reading form, checkout, order & report pages
 *   messages/<locale>/pages.json  offers, blog, library, legal & contact pages
 * Top-level namespaces must be unique across the files of a locale.
 */
export const catalogs = {
  en: { ...enBase, ...enFlows, ...enPages },
  ar: { ...arBase, ...arFlows, ...arPages },
};

export type Catalog = typeof enBase & typeof enFlows & typeof enPages;
