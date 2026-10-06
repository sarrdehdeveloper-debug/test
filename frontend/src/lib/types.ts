/**
 * TypeScript mirror of the public API contract (docs/ARCHITECTURE.md §5).
 * JSON keys stay snake_case exactly as the API sends them. Money is in minor units (`*_cents`).
 * Dates are `YYYY-MM-DD`, times `HH:MM`, datetimes ISO-8601 strings.
 */

/* ------------------------------------------------------------------ enums */

export const WESTERN_SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;
export type WesternSign = (typeof WESTERN_SIGNS)[number];

export const CHINESE_ANIMALS = [
  "rat",
  "ox",
  "tiger",
  "rabbit",
  "dragon",
  "snake",
  "horse",
  "goat",
  "monkey",
  "rooster",
  "dog",
  "pig",
] as const;
export type ChineseAnimal = (typeof CHINESE_ANIMALS)[number];

export const ELEMENTS = ["wood", "fire", "earth", "metal", "water"] as const;
export type Element = (typeof ELEMENTS)[number];

export type Polarity = "yin" | "yang";
export type YearBoundary = "lichun" | "lunar_new_year";
export type DayBoundary = "midnight" | "zi_23";

export const ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "queued",
  "generating",
  "ready",
  "generation_failed",
  "expired",
  "abandoned",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses after which the order page can stop polling. */
export const FINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "ready",
  "generation_failed",
  "expired",
  "abandoned",
  "refunded",
];

/* ----------------------------------------------------------------- errors */

export interface ApiFieldError {
  field: string;
  message: string;
  type: string;
}

/** `{"error": {"code", "message", "details"}}` — every non-2xx API response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export type DiscountErrorReason =
  "not_found" | "inactive" | "not_started" | "expired" | "exhausted" | "currency_mismatch";

export interface AmbiguousTimeOption {
  fold: 0 | 1;
  utc_offset_minutes: number;
  label: string;
}

/* ----------------------------------------------------------------- shared */

export interface ItemsResponse<T> {
  items: T[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/* ----------------------------------------------------------------- config */

export interface PublicConfig {
  locales: string[];
  default_locale: string;
  paid_price_cents: number;
  currency: string;
  report_access_hours: number;
  payment_provider: "stripe" | "fake" | (string & {});
  min_birth_date: string;
}

/* -------------------------------------------------------------------- geo */

export interface Country {
  code: string;
  name: string;
  name_en: string;
  timezones: string[];
  capital_city_id: number | null;
}

export interface City {
  id: number;
  name: string;
  admin1: string | null;
  country_code: string;
  timezone: string;
  latitude: number;
  longitude: number;
  population: number;
  is_capital: boolean;
  label: string;
}

/* ------------------------------------------------------------ free reading */

export interface FreeReadingRequest {
  birth_date: string;
  email: string;
  locale: string;
  marketing_opt_in: boolean;
}

export interface FreeSigns {
  sun_sign: WesternSign;
  /** Set when the Sun changes sign on that date (exact sign needs the birth time). */
  sun_sign_alternative: WesternSign | null;
  year_animal: ChineseAnimal;
  year_element: Element;
  /** Set when the Chinese year boundary falls on that date. */
  year_animal_alternative: ChineseAnimal | null;
  year_boundary: YearBoundary;
}

export interface ReadingBlock {
  key: string;
  title: string;
  body_html: string;
}

export interface FreeReadingResult {
  signs: FreeSigns;
  sign_reading: ReadingBlock | null;
  animal_reading: ReadingBlock | null;
}

/* ----------------------------------------------------------------- orders */

export interface QuoteRequest {
  discount_code: string | null;
}

export interface AppliedDiscount {
  code: string;
  kind: "percent" | "fixed";
  /** percent: whole percent; fixed: minor units */
  value: number;
}

export interface Quote {
  list_price_cents: number;
  discount_cents: number;
  amount_cents: number;
  currency: string;
  discount: AppliedDiscount | null;
}

export interface OrderCreate {
  email: string;
  locale: string;
  display_name: string | null;
  birth_date: string;
  birth_time: string;
  city_id: number;
  time_fold: 0 | 1 | null;
  discount_code: string | null;
  marketing_opt_in: boolean;
  accept_terms: boolean;
}

export interface OrderCreated {
  order_id: string;
  /** Shown once: store it in localStorage["zb_order_<order_id>"]. */
  access_token: string;
  /** Payment page URL; for a 0-amount order this is the order page URL. */
  checkout_url: string;
  amount_cents: number;
  currency: string;
  status: OrderStatus;
}

export interface OrderSigns {
  sun: WesternSign;
  moon: WesternSign;
  ascendant: WesternSign;
  year_animal: ChineseAnimal;
  month_animal: ChineseAnimal;
  day_animal: ChineseAnimal;
}

export interface OrderStatusOut {
  order_id: string;
  status: OrderStatus;
  locale: string;
  email_masked: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  ready_at: string | null;
  access_expires_at: string | null;
  download_available: boolean;
  progress: { sections_done: number; sections_total: number };
  signs: OrderSigns | null;
}

export interface CheckoutOut {
  checkout_url: string;
}

export interface FakePaymentComplete {
  order_id: string;
  access_token: string;
}

/* ---------------------------------------------------------------- content */

export interface OfferOut {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  body_html: string;
  cta_label: string | null;
  /** Relative ("/reading?code=X") or absolute URL; null means the paid reading page. */
  cta_url: string | null;
  image_url: string | null;
  show_banner: boolean;
  discount_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  author_name: string;
  published_at: string | null;
}

export interface PostOut extends PostSummary {
  body_html: string;
  seo_title: string | null;
  seo_description: string | null;
  available_locales: string[];
}

export interface BookOut {
  slug: string;
  title: string;
  description_html: string;
  cover_image_url: string | null;
  purchase_url: string | null;
}

export interface SeriesOut {
  slug: string;
  title: string;
  description_html: string;
  cover_image_url: string | null;
  books: BookOut[];
}

/** GET /site-content: `items` = plain values by key, `html` = sanitised HTML for markdown keys. */
export interface SiteContent {
  locale: string;
  items: Record<string, string>;
  html: Record<string, string>;
}
