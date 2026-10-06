/**
 * TypeScript mirror of the ADMIN API (`/api/v1/admin/...`, docs/ARCHITECTURE.md §6 + §10).
 * Source of truth: backend/app/{admin_auth,content,orders,prompts}/…schemas.py and the routers.
 *
 * Conventions: datetimes are ISO-8601 UTC strings, money is in minor units (`*_cents`) + ISO
 * currency, translatable rows store `translations = {en: {...}, ar: {...}}`.
 * Request bodies of PATCH endpoints are partial: omit a field to keep it; `null` is only accepted
 * where the type below allows it (e.g. clearing an image URL).
 */
import type { OrderStatus } from "@/lib/types";

export type { OrderStatus } from "@/lib/types";
export { ORDER_STATUSES } from "@/lib/types";

/* ================================================================== shared */

export type IsoDateTime = string;
export type IsoDate = string;
export type Locale = string;

/** Every admin list endpoint: `{items, total, page, page_size}`. */
export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** Query of paginated list endpoints (`page_size` ≤ 100). */
export interface PageParams {
  page?: number;
  page_size?: number;
}

/** `{deleted: true}` (offers, series, books, posts, media). */
export interface DeleteOut {
  deleted: boolean;
}

/** `{ok: true}` (logout, password change). */
export interface OkOut {
  ok: boolean;
}

/* ================================================================== auth & users */

export const ADMIN_ROLES = ["owner", "admin", "editor"] as const;
/** `owner` ⊃ `admin` ⊃ `editor`. Managers = owner + admin. */
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** `GET /auth/me`, login, MFA enable/disable → `{user: AdminUser}`. */
export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
  mfa_enabled: boolean;
  last_login_at: IsoDateTime | null;
}

export interface UserEnvelope {
  user: AdminUser;
}

/** `POST /auth/login` (header X-ZB-Admin required). 401 `invalid_credentials` | `mfa_required` | `invalid_mfa_code`, 429 `rate_limited` (`details.retry_after_seconds`). */
export interface LoginIn {
  email: string;
  password: string;
  totp_code?: string | null;
}

/** `POST /auth/password` → OkOut. 422 `invalid_password` (field `current_password`), 422 validation (min 12 chars, must differ). Revokes the user's other sessions. */
export interface PasswordChangeIn {
  current_password: string;
  new_password: string;
}

/** `POST /auth/mfa/setup` → secret + otpauth URL (409 `mfa_already_enabled`). */
export interface MfaSetupOut {
  secret: string;
  otpauth_url: string;
}

/** `POST /auth/mfa/enable` → UserEnvelope. 409 `mfa_already_enabled` | `mfa_setup_required`, 422 `invalid_mfa_code`. */
export interface MfaEnableIn {
  code: string;
}

/** `POST /auth/mfa/disable` → UserEnvelope. 409 `mfa_not_enabled`, 422 `invalid_password` | `invalid_mfa_code`. */
export interface MfaDisableIn {
  password: string;
  code: string;
}

/** Password policy of the backend (`PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH`). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

/** `GET /users` (owner) items; `POST /users` → 201; `PATCH/DELETE /users/{id}`. */
export interface ManagedUser extends AdminUser {
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** `POST /users` (owner). 409 `email_taken`. */
export interface UserCreateIn {
  email: string;
  name: string;
  role: AdminRole;
  password: string;
}

/** `PATCH /users/{id}` (owner). 409 `last_owner`, 403 `self_change_forbidden`. `DELETE` deactivates. */
export interface UserUpdateIn {
  name?: string;
  role?: AdminRole;
  is_active?: boolean;
  password?: string;
  /** Clears the user's MFA enrolment (lost authenticator). */
  reset_mfa?: boolean;
}

/** `GET /audit-logs?page&page_size(≤100)&entity_type&action&user_id` (managers). */
export interface AuditLogQuery extends PageParams {
  entity_type?: string;
  action?: string;
  user_id?: number;
}

export interface AuditLogEntry {
  id: number;
  created_at: IsoDateTime;
  user_id: number | null;
  user_email: string | null;
  /** e.g. `offer.update`, `auth.mfa_enable`, `order.retry_generation`. */
  action: string;
  /** e.g. `offer`, `blog_post`, `order`, `settings`, `admin_user`. */
  entity_type: string;
  entity_id: string | null;
  data: Record<string, unknown>;
  ip: string | null;
}

/* ================================================================== orders, dashboard, jobs (managers) */

export const JOB_STATUSES = ["pending", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Known job kinds (`jobs.kind`). */
export type JobKind = "generate_report" | "send_report_email" | "cleanup" | (string & {});

export const SECTION_STATUSES = ["pending", "done", "failed"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export type DiscountKind = "percent" | "fixed";

/** `GET /orders?status&q&page&page_size(≤100)` items. `q` searches email / order id. */
export interface AdminOrderItem {
  id: string;
  status: OrderStatus;
  email: string;
  amount_cents: number;
  currency: string;
  created_at: IsoDateTime;
  paid_at: IsoDateTime | null;
  ready_at: IsoDateTime | null;
  locale: Locale;
  discount_code: string | null;
}

export interface AdminOrderQuery extends PageParams {
  status?: OrderStatus;
  q?: string;
}

export interface AdminOrderSigns {
  sun: string | null;
  moon: string | null;
  ascendant: string | null;
  year_animal: string | null;
  month_animal: string | null;
  day_animal: string | null;
}

export interface AdminChartSummary {
  calc_version: string;
  signs: AdminOrderSigns;
  warnings: string[];
  year_boundary: string | null;
  day_boundary: string | null;
}

export interface AdminSection {
  slot: number;
  title: string;
  status: SectionStatus;
  attempts: number;
  word_count: number;
  model: string | null;
  content: string;
  content_truncated: boolean;
  last_error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  updated_at: IsoDateTime;
}

export interface AdminReport {
  created_at: IsoDateTime;
  expires_at: IsoDateTime;
  email_sent_at: IsoDateTime | null;
  download_count: number;
  last_download_at: IsoDateTime | null;
  deleted_at: IsoDateTime | null;
  size_bytes: number;
}

export interface AdminPaymentEvent {
  id: number;
  provider: string;
  event_id: string;
  event_type: string;
  outcome: string;
  received_at: IsoDateTime;
  data: Record<string, unknown>;
}

/** `GET /jobs?status(default failed)&page&page_size` items; `POST /jobs/{id}/retry` → AdminJob (409 `job_not_failed`). */
export interface AdminJob {
  id: number;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: IsoDateTime;
  created_at: IsoDateTime;
  finished_at: IsoDateTime | null;
  last_error: string | null;
  dedupe_key: string | null;
  /** Only the order reference of the payload is exposed. */
  order_id: string | null;
}

export interface AdminJobQuery extends PageParams {
  status?: JobStatus;
}

/** `GET /orders/{id}` (404 unknown). */
export interface AdminOrderDetail extends AdminOrderItem {
  display_name: string | null;
  marketing_opt_in: boolean;
  birth_date: IsoDate | null;
  birth_time: string | null;
  place_label: string | null;
  timezone: string | null;
  list_price_cents: number;
  discount_cents: number;
  payment_provider: string;
  provider_session_id: string | null;
  provider_payment_id: string | null;
  updated_at: IsoDateTime;
  generation_started_at: IsoDateTime | null;
  last_error: string | null;
  personal_data_purged_at: IsoDateTime | null;
  prompt_version_ids: number[];
  download_available: boolean;
  progress: { sections_done: number; sections_total: number };
  chart: AdminChartSummary;
  sections: AdminSection[];
  report: AdminReport | null;
  payment_events: AdminPaymentEvent[];
  jobs: AdminJob[];
}

/** `POST /orders/{id}/retry-generation` (409 `order_not_retryable` | `generation_in_progress`). */
export interface RetryGenerationOut {
  order_id: string;
  status: OrderStatus;
  job_id: number;
}

/** `POST /orders/{id}/resend-email` (409 `report_not_available`). */
export interface ResendEmailOut {
  order_id: string;
  job_id: number;
}

/** `POST /orders/{id}/extend-access {hours: 1..168}`. */
export interface ExtendAccessIn {
  hours: number;
}
export const MAX_EXTEND_HOURS = 168;

export interface ExtendAccessOut {
  order_id: string;
  expires_at: IsoDateTime;
}

export interface WindowCounts {
  today: number;
  last_7_days: number;
  last_30_days: number;
}

/** `GET /dashboard` (managers). */
export interface DashboardOut {
  /** Paid orders (refunded excluded). */
  orders: WindowCounts;
  /** In `currency` (the configured currency). */
  revenue_cents: WindowCounts;
  currency: string;
  /** Count per order status (every status present). */
  status_counts: Partial<Record<OrderStatus, number>> & Record<string, number>;
  free_readings: WindowCounts;
  failed_jobs: number;
  recent_orders: AdminOrderItem[];
}

/* ================================================================== prompts (managers) */

export type PromptStatus = "draft" | "published" | "archived";
export const PROMPT_SLOTS = [1, 2, 3, 4, 5, 6] as const;
export type PromptSlot = (typeof PROMPT_SLOTS)[number];

export interface PromptVersion {
  id: number;
  slot: number;
  version: number;
  name: string;
  /** Section title per locale (`{en: "...", ar: "..."}`). */
  section_titles: Record<Locale, string>;
  template: string;
  system_instruction: string;
  /** `null` = use the global `min_words` setting. */
  min_words: number | null;
  status: PromptStatus;
  notes: string;
  created_by_id: number | null;
  created_by_name: string | null;
  created_at: IsoDateTime;
  published_at: IsoDateTime | null;
}

export interface PromptSlotSummary {
  slot: number;
  published: PromptVersion | null;
  draft: PromptVersion | null;
  versions_count: number;
}

/** `GET /prompts`. */
export interface PromptSlotsOut {
  slots: PromptSlotSummary[];
}

/** Editable prompt fields; omitted fields are kept / copied from the base version. */
export interface PromptFields {
  name?: string;
  section_titles?: Record<Locale, string>;
  template?: string;
  system_instruction?: string;
  /** Explicit `null` = use the global setting. */
  min_words?: number | null;
  notes?: string;
}

/** `POST /prompts/{slot}/versions` → 201 PromptVersion (409 `draft_exists`, 422 `invalid_base_version` | `invalid_template`). */
export interface PromptDraftCreate extends PromptFields {
  base_version_id?: number | null;
}

/** `PATCH /prompts/versions/{id}` (drafts only, 409 `not_draft`). `DELETE` → 204 (drafts only). `POST …/publish` → PromptVersion. */
export type PromptDraftUpdate = PromptFields;

/** `POST /prompts/versions/{id}/preview` — unsaved `template`/`system_instruction` may be passed. */
export interface PromptPreviewIn {
  locale?: Locale | null;
  template?: string;
  system_instruction?: string;
}

export interface PromptPreviewOut {
  locale: Locale;
  rendered_prompt: string;
  rendered_system_instruction: string | null;
}

/** `POST /prompts/versions/{id}/test {locale}` (rate limited 10/min; 503 `ai_unavailable` | `ai_not_configured`, 502 `ai_error`). */
export interface PromptTestOut {
  output: string;
  output_html: string;
  word_count: number;
  min_words: number;
  model: string;
  finish_reason: string | null;
}

export interface PromptVariable {
  name: string;
  description: string;
  example: unknown;
}

/** `GET /prompts/variables?locale`. */
export interface PromptVariablesOut {
  locale: Locale;
  items: PromptVariable[];
}

/* ================================================================== site content & free readings (editors) */

export type ContentFormat = "text" | "lines" | "markdown";

export interface ContentKey {
  key: string;
  format: ContentFormat;
  /** First key segment, e.g. `home`, `free`, `legal`. */
  group: string;
  description: string;
}

/** `GET /site-content?locale` and the response of `PUT /site-content`. */
export interface SiteContentAdminOut {
  locale: Locale;
  items: Record<string, string>;
  keys: ContentKey[];
}

/** `PUT /site-content` — only known keys; values ≤ 20 000 chars. */
export interface SiteContentUpdate {
  locale: Locale;
  items: Record<string, string>;
}

export type FreeReadingKind = "sign" | "animal";

/** `GET /free-readings?kind&locale` items (`id`/`updated_at` null when never saved). */
export interface FreeReading {
  id: number | null;
  kind: FreeReadingKind;
  /** Western sign (`aries`…) or Chinese animal (`rat`…). */
  key: string;
  locale: Locale;
  title: string;
  /** Markdown. */
  body: string;
  updated_at: IsoDateTime | null;
}

/** `PUT /free-readings/{kind}/{key}/{locale}` → FreeReading. Empty strings are allowed. */
export interface FreeReadingIn {
  title: string;
  body: string;
}

/* ================================================================== translations */

/**
 * `{en: {...}, ar: {...}}`. On save the backend drops entries whose fields are all blank, requires a
 * `title` for every partially filled entry and a title in the default locale (422 `validation_error`
 * on field `translations`).
 */
export type Translations<T> = Partial<Record<Locale, T>>;

export interface OfferTranslation {
  title: string;
  subtitle: string;
  /** Markdown. */
  body: string;
  cta_label: string;
}

export interface LibraryTranslation {
  title: string;
  /** Markdown. */
  description: string;
}

export interface PostTranslation {
  title: string;
  excerpt: string;
  /** Markdown. */
  body: string;
  seo_title: string;
  seo_description: string;
}

/* ================================================================== offers (editors) */

/** Links: a site-relative path (`/reading`) or an absolute http(s) URL. */
export type LinkUrl = string;

export interface OfferAdmin {
  id: number;
  slug: string;
  translations: Translations<Partial<OfferTranslation>>;
  image_url: LinkUrl | null;
  cta_url: LinkUrl | null;
  discount_code_id: number | null;
  discount_code: string | null;
  show_banner: boolean;
  is_active: boolean;
  starts_at: IsoDateTime | null;
  ends_at: IsoDateTime | null;
  sort_order: number;
  /** Active and inside its date window right now. */
  is_live: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** `POST /offers` → 201 (409 `slug_taken`). Slug: 2–120 of `[a-z0-9-]`. */
export interface OfferCreate {
  slug: string;
  translations: Translations<Partial<OfferTranslation>>;
  image_url?: LinkUrl | null;
  cta_url?: LinkUrl | null;
  discount_code_id?: number | null;
  show_banner?: boolean;
  is_active?: boolean;
  starts_at?: IsoDateTime | null;
  ends_at?: IsoDateTime | null;
  sort_order?: number;
}

/** `PATCH /offers/{id}`. */
export type OfferUpdate = Partial<OfferCreate>;

/* ================================================================== discounts (managers) */

export interface Discount {
  id: number;
  code: string;
  description: string;
  kind: DiscountKind;
  /** percent: whole percent 1..100; fixed: minor units in `currency`. */
  value: number;
  currency: string | null;
  is_active: boolean;
  starts_at: IsoDateTime | null;
  ends_at: IsoDateTime | null;
  max_redemptions: number | null;
  redemptions_count: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** `POST /discounts` → 201 (409 `code_taken`). Code: 3–64 of `[A-Z0-9_-]` (upper-cased). */
export interface DiscountCreate {
  code: string;
  description?: string;
  kind: DiscountKind;
  value: number;
  currency?: string | null;
  is_active?: boolean;
  starts_at?: IsoDateTime | null;
  ends_at?: IsoDateTime | null;
  max_redemptions?: number | null;
}

/** `PATCH /discounts/{id}`. */
export type DiscountUpdate = Partial<DiscountCreate>;

/** `DELETE /discounts/{id}`: deleted when unused, otherwise deactivated. */
export interface DiscountDeleteOut {
  deleted: boolean;
  deactivated: boolean;
}

/* ================================================================== galaxy library (editors) */

export interface BookAdmin {
  id: number;
  series_id: number;
  slug: string;
  translations: Translations<Partial<LibraryTranslation>>;
  cover_image_url: LinkUrl | null;
  purchase_url: LinkUrl | null;
  is_published: boolean;
  sort_order: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface SeriesAdmin {
  id: number;
  slug: string;
  translations: Translations<Partial<LibraryTranslation>>;
  cover_image_url: LinkUrl | null;
  is_published: boolean;
  sort_order: number;
  books_count: number;
  books: BookAdmin[];
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** `POST /book-series` → 201 (409 `slug_taken`). */
export interface SeriesCreate {
  slug: string;
  translations: Translations<Partial<LibraryTranslation>>;
  cover_image_url?: LinkUrl | null;
  is_published?: boolean;
  sort_order?: number;
}

/** `PATCH /book-series/{id}`. */
export type SeriesUpdate = Partial<SeriesCreate>;

/** `POST /book-series/{id}/books` → 201 (409 `slug_taken`). */
export interface BookCreate {
  slug: string;
  translations: Translations<Partial<LibraryTranslation>>;
  cover_image_url?: LinkUrl | null;
  purchase_url?: LinkUrl | null;
  is_published?: boolean;
  sort_order?: number;
}

/** `PATCH /books/{id}`. */
export type BookUpdate = Partial<BookCreate>;

/* ================================================================== blog (editors) */

export type PostStatus = "draft" | "published";

/** `GET /blog-posts?status&page&page_size` items. `title` is the default-locale title. */
export interface PostAdminSummary {
  id: number;
  slug: string;
  status: PostStatus;
  title: string;
  author_name: string;
  cover_image_url: LinkUrl | null;
  published_at: IsoDateTime | null;
  /** Locales that have a title. */
  available_locales: Locale[];
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** `GET/PATCH /blog-posts/{id}`, `POST …/publish`, `POST …/unpublish`. */
export interface PostAdmin extends PostAdminSummary {
  translations: Translations<Partial<PostTranslation>>;
}

export interface PostListQuery extends PageParams {
  status?: PostStatus;
}

/** `POST /blog-posts` → 201 PostAdmin (409 `slug_taken`). Slug: 2–160 of `[a-z0-9-]`. */
export interface PostCreate {
  slug: string;
  translations: Translations<Partial<PostTranslation>>;
  cover_image_url?: LinkUrl | null;
  author_name?: string;
}

/** `PATCH /blog-posts/{id}`; `published_at` may be moved (future = scheduled). */
export interface PostUpdate {
  slug?: string;
  translations?: Translations<Partial<PostTranslation>>;
  cover_image_url?: LinkUrl | null;
  author_name?: string;
  published_at?: IsoDateTime | null;
}

/* ================================================================== media & markdown (editors) */

/** `POST /media` (multipart `file`; jpeg/png/webp/gif ≤ 5 MB) → 201; `GET /media?page`; `DELETE /media/{id}` (409 `media_in_use`). */
export interface MediaItem {
  id: number;
  /** Same-origin path, e.g. `/api/v1/media/<hex>.webp`. */
  url: string;
  file_name: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt: Record<Locale, string>;
  created_at: IsoDateTime;
}

/** Upload limits enforced by the backend (413 `file_too_large`, 422 `invalid_image` / `image_too_large`). */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** `POST /markdown/preview {markdown}` (≤ 100 000 chars) → `{html}` (sanitised). */
export interface MarkdownPreviewIn {
  markdown: string;
}
export interface HtmlOut {
  html: string;
}

/* ================================================================== settings (managers) */

/** Keys of `settings_store.DEFAULTS` (all editable in the dashboard). */
export interface BusinessSettings {
  paid_price_cents: number;
  currency: string;
  gemini_model: string;
  gemini_temperature: number;
  gemini_max_output_tokens: number;
  gemini_timeout_seconds: number;
  prompt_delay_min_seconds: number;
  prompt_delay_max_seconds: number;
  min_words: number;
  max_attempts_per_prompt: number;
  report_access_hours: number;
  email_attach_pdf: boolean;
  chinese_year_boundary: "lichun" | "lunar_new_year";
  chinese_day_boundary: "midnight" | "zi_23";
  personal_data_retention_days: number;
  abandoned_order_hours: number;
  free_reading_rate_limit_per_hour: number;
  order_rate_limit_per_hour: number;
}

/** `GET /settings`. */
export interface SettingsOut {
  values: BusinessSettings;
  defaults: BusinessSettings;
}

/** `PUT /settings` → SettingsOut (422 `invalid_setting` with a message naming the key). */
export interface SettingsUpdate {
  values: Partial<BusinessSettings>;
}
