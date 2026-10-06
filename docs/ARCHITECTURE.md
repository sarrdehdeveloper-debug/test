# Zodiac Blend — Architecture & Contracts

> "Two Traditions. One Truth." — a site that blends Western astrology with the Chinese zodiac.
> This file is the **contract** every module follows. Change it together with the code.

## 1. System overview

```
Browser ──► Next.js (frontend/, port 3000) ──/api/* rewrite──► FastAPI (backend/, port 8000) ──► PostgreSQL
                                                                     ▲
                                              Worker (python -m app.worker) — same codebase, polls the
                                              PostgreSQL job queue: Gemini prompts → PDF → email, cleanup
```

* **frontend/** — Next.js 16 App Router + TypeScript + Tailwind v4 + next-intl. Public site (locales
  `en`, `ar`; `ar` is RTL) and the admin dashboard (`/admin`, English UI). All data comes from the API.
  The browser only ever talks to the Next.js origin; `/api/*` is proxied to FastAPI, so admin cookies
  are first-party.
* **backend/** — Python 3.11, FastAPI, SQLAlchemy 2 (sync), PostgreSQL 16, Alembic. Owns **all** data
  and business logic: calculations, orders, payments, prompts, generation, PDFs, emails, CMS.
* **Worker** — same Python package; durable job queue in PostgreSQL (`jobs` table, claimed with
  `FOR UPDATE SKIP LOCKED`), so no separate broker is needed. Jobs are inserted in the same
  transaction as the state change that needs them (transactional outbox).

Why this shape (see `docs/research/`): calculations need Python libraries; a single schema owner
avoids two ORMs on one database; a PostgreSQL queue gives exactly-once *enqueue* with the payment
state change and survives restarts, which is what paid reports need.

## 2. Backend layout & module ownership

```
backend/app/
  config.py         env settings (ZB_*)            settings_store.py  runtime business settings (DB)
  db.py models.py   engine/session + ALL tables    security.py        tokens, hashing, passwords
  errors.py         ApiError + JSON error format   utils.py           utcnow, client_ip, locales, i18n pick
  ratelimit.py      in-process rate limiter        audit.py           admin audit log helper
  markdown.py       safe markdown -> HTML          main.py            app factory, router mounting
  cli.py            create-admin / import-geo / seed / worker
  worker.py         job worker process (threads + periodic cleanup scheduler)
  astro/            western astronomy: Sun, Moon, Ascendant (Meeus), time-zone resolution
  chinese/          BaZi pillars & animals (lunar-python)
  charts/           schemas.py (Chart contract) + service.py (build_chart, free_signs)
  geo/              countries & cities import + search API
  free_reading/     free plan API
  orders/           quote, order creation/status, pricing & discounts, admin orders/dashboard
  payments/         provider abstraction (stripe, fake), webhooks, confirm_payment
  prompts/          admin API for the 6 versioned prompts
  generation/       AI client (Gemini/fake), word counting, templating, generate_report job
  reports/          PDF rendering, private storage, download API, email, cleanup job
  content/          public content API + admin CMS (site content, free readings, offers,
                    discounts, library, blog, media, settings)
  admin_auth/       admin login/MFA/sessions (deps.py), admin users, audit log API
  seed/             sample content loader (python -m app.cli seed)
```

Rules: modules talk through the functions named in this document. `models.py` is the only place
tables are defined. Every router lives in `<module>/router.py` (public) or `<module>/admin_router.py`
and is mounted by `main.py` (prefixes below). Tests live in `backend/tests/test_<module>*.py` and use
the fixtures in `tests/conftest.py` (own throw-away database per test run).

## 3. Conventions

* JSON in/out, `snake_case` keys. Dates `YYYY-MM-DD`, times `HH:MM`, datetimes ISO-8601 UTC with `Z`/offset.
* Errors: `{"error": {"code": "snake_code", "message": "human text", "details": {...}}}` (see `errors.py`).
  Validation errors: status 422, code `validation_error`, `details.fields = [{field, message, type}]`.
* Money in minor units (`*_cents`) + ISO currency.
* Locales: `ZB_LOCALES` (default `["en","ar"]`); every public endpoint takes `?locale=` (or body
  `locale`) and falls back to the default locale (`utils.normalize_locale`, `utils.pick_translation`).
* Translatable rows store `translations = {"en": {...}, "ar": {...}}`.
* Rich text is **Markdown** in the DB; APIs return sanitised `*_html` via `app.markdown.render_markdown`.
* Admin endpoints: cookie session + header `X-ZB-Admin: 1` on every non-GET request (CSRF guard).
  Roles: `owner` ⊃ `admin` ⊃ `editor`. Use `require_editor` / `require_manager` / `require_owner`
  from `app.admin_auth.deps`. Record admin mutations with `app.audit.record(...)`.
* Never log or store raw tokens, birth data in logs, or full card/payment data.

## 4. Calculation contracts

`app.charts.schemas` defines `Chart`, `WesternChart`, `ChineseChart`, `Pillar`, `FreeSigns`.

### 4.1 Time resolution — `app/astro/timezones.py`
```python
@dataclass(frozen=True)
class ResolvedTime:
    local: datetime            # aware, tzinfo=ZoneInfo(tz_name), fold applied
    utc: datetime              # aware UTC
    utc_offset_minutes: int
    is_dst: bool
    fold: int

class AmbiguousLocalTime(Exception):   # wall time occurs twice (DST fall-back)
    options: list[ResolvedTime]         # fold=0 (earlier, usually DST) and fold=1
class NonexistentLocalTime(Exception): # wall time skipped (DST spring-forward)
    suggested: ResolvedTime             # same instant expressed after the gap

def resolve_local_time(d: date, t: time, tz_name: str, fold: int | None = None) -> ResolvedTime
```
`fold=None` → raise `AmbiguousLocalTime` when ambiguous; `fold` 0/1 → use it. Nonexistent times always
raise. Historical rules come from the IANA database (`zoneinfo` + `tzdata`), never fixed offsets.

### 4.2 Western — `app/astro/western.py` (tropical zodiac, geocentric, apparent positions)
```python
def sun_longitude(utc: datetime) -> float          # degrees [0,360)
def moon_longitude(utc: datetime) -> float
def ascendant_longitude(utc: datetime, latitude: float, longitude: float) -> float  # east-positive lon
def sign_of(longitude: float) -> WesternSign
def zodiac_point(longitude: float) -> ZodiacPoint
def compute_western(utc: datetime, latitude: float, longitude: float) -> WesternChart
def sun_sign_for_date(d: date) -> tuple[WesternSign, WesternSign | None]   # (sign, alternative if ingress that day)
```
Pure Python (Meeus, *Astronomical Algorithms*), MIT-clean — no AGPL Swiss Ephemeris in production.
Accuracy targets vs. an independent ephemeris (PyEphem, test-only): Sun ≤ 0.01°, Moon ≤ 0.05°,
Ascendant ≤ 0.1° for 1900–2100.

### 4.3 Chinese — `app/chinese/bazi.py` (lunar-python, MIT)
```python
def compute_chinese(local: datetime, year_boundary: YearBoundary, day_boundary: DayBoundary) -> ChineseChart
def year_pillar_for_date(d: date, year_boundary: YearBoundary) -> tuple[Pillar, ChineseAnimal | None]
```
* Year & month pillars change at solar-term **instants**; the birth instant is converted to China
  Standard Time (UTC+8, the time scale lunar-python uses for solar terms) before comparing.
* Day & hour pillars use the local civil (clock) time of the birthplace; `day_boundary="zi_23"`
  starts the day at 23:00. No true-solar-time correction (documented limitation, settable later).
* `year_boundary="lichun"` (BaZi convention, default) or `"lunar_new_year"` (popular zodiac).
  Both are settings (`settings_store`) and are recorded in each order's chart.

### 4.4 Composition — `app/charts/service.py`
```python
@dataclass
class Place:  latitude: float; longitude: float; timezone: str; label: str

def build_chart(birth_date: date, birth_time: time, place: Place, *, fold: int | None,
                year_boundary: YearBoundary, day_boundary: DayBoundary) -> Chart
def free_signs(birth_date: date, *, year_boundary: YearBoundary) -> FreeSigns
```
`build_chart` raises the time-resolution exceptions above unchanged. Supported birth dates:
1900-01-01 … today.

## 5. Public API (`/api/v1`)

| Method & path | Body / query | Response |
|---|---|---|
| `GET /health` | | `{"status":"ok"}` |
| `GET /public-config` | | `{"locales":["en","ar"],"default_locale":"en","paid_price_cents":2900,"currency":"USD","report_access_hours":24,"payment_provider":"fake","min_birth_date":"1900-01-01"}` |
| `GET /geo/countries` | `locale` | `{"items":[{"code":"EG","name":"مصر","name_en":"Egypt","timezones":["Africa/Cairo"],"capital_city_id":360630}]}` sorted by localised name |
| `GET /geo/cities` | `country` (req), `q`, `limit≤50`, `locale` | `{"items":[City]}`; empty `q` → most populous first |
| `POST /free-reading` | `{"birth_date","email","locale","marketing_opt_in":false}` | `FreeReadingResult` (below) |
| `POST /orders/quote` | `{"discount_code": str\|null}` | `Quote` |
| `POST /orders` | `OrderCreate` | `201 OrderCreated` |
| `GET /orders/{order_id}` | header `X-Order-Token` | `OrderStatusOut` |
| `POST /orders/{order_id}/checkout` | header `X-Order-Token` | `{"checkout_url"}` (new session; only while `awaiting_payment`) |
| `POST /payments/stripe/webhook` | raw Stripe event + `Stripe-Signature` | `{"received":true}` |
| `POST /payments/fake/complete` | `{"order_id","access_token"}` — only when provider=`fake` and env≠production | `{"status":"queued"}` |
| `GET /reports/{order_id}/download` | header `Authorization: Bearer <token>` (browser access token **or** email token) | `application/pdf`, `Content-Disposition: attachment; filename="ZodiacBlend-Report.pdf"`, `Cache-Control: no-store`. 404 bad token, 410 `report_expired`, 409 `report_not_ready` |
| `GET /site-content` | `locale` | `{"locale":"ar","items":{"home.hero.title":"..."},"html":{"legal.privacy.body":"<p>…</p>"}}` — keys from `app/content/keys.py`; default-locale fallback per key; `html` holds sanitised HTML for `markdown`-format keys |
| `GET /offers` | `locale`, `banner=true` (only banner offers) | `{"items":[OfferOut]}` active & within dates, by `sort_order` |
| `GET /offers/{slug}` | `locale` | `OfferOut` |
| `GET /blog` | `locale`, `page=1`, `page_size=9` (≤50) | `{"items":[PostSummary],"total","page","page_size"}` published only, newest first |
| `GET /blog/{slug}` | `locale` | `PostOut` |
| `GET /library` | `locale` | `{"items":[SeriesOut]}` published series with published books |
| `GET /library/{slug}` | `locale` | `SeriesOut` |
| `GET /media/{file_name}` | | image bytes, long cache |

Shapes:
```jsonc
City = {"id":360630,"name":"Cairo","admin1":"Cairo Governorate","country_code":"EG","timezone":"Africa/Cairo",
        "latitude":30.06,"longitude":31.25,"population":9606916,"is_capital":true,"label":"Cairo, Egypt"}

FreeReadingResult = {
  "signs": FreeSigns,                       // app.charts.schemas.FreeSigns
  "sign_reading":   {"key":"leo","title":"...","body_html":"<p>...</p>"} | null,
  "animal_reading": {"key":"horse","title":"...","body_html":"..."} | null
}

Quote = {"list_price_cents":2900,"discount_cents":290,"amount_cents":2610,"currency":"USD",
         "discount":{"code":"SAVE10","kind":"percent","value":10} | null}
// invalid code -> 422 {"code":"invalid_discount_code","details":{"reason":"not_found|inactive|not_started|expired|exhausted|currency_mismatch"}}

OrderCreate = {"email","locale","display_name":null,"birth_date":"1990-08-17","birth_time":"14:30",
               "city_id":360630,"time_fold":null,"discount_code":null,"marketing_opt_in":false,"accept_terms":true}
// 422 "ambiguous_local_time"   details {"options":[{"fold":0,"utc_offset_minutes":180,"label":"01:30 (UTC+03:00)"},{"fold":1,...}]}
// 422 "nonexistent_local_time" details {"suggested_time":"03:30"}
// 422 "birth_date_out_of_range", 404 city, 422 invalid_discount_code, 422 "terms_not_accepted", 429 rate_limited
OrderCreated = {"order_id":"uuid","access_token":"<shown once>","checkout_url":"https://...",
                "amount_cents":2900,"currency":"USD","status":"awaiting_payment"}
// amount 0 (100% discount): no checkout; order goes straight to "queued", checkout_url = order page URL.

OrderStatusOut = {"order_id","status","locale","email_masked":"a***@example.com","amount_cents","currency",
  "created_at","paid_at","ready_at","access_expires_at","download_available":true,
  "progress":{"sections_done":3,"sections_total":6},
  "signs":{"sun":"leo","moon":"pisces","ascendant":"scorpio","year_animal":"horse",
           "month_animal":"monkey","day_animal":"rabbit"}}
// unknown order or wrong token -> 404 (never reveal existence)

OfferOut = {"id","slug","title","subtitle","body_html","cta_label","cta_url","image_url","show_banner",
            "discount_code":"SAVE10"|null,"starts_at","ends_at"}
PostSummary = {"slug","title","excerpt","cover_image_url","author_name","published_at"}
PostOut = PostSummary + {"body_html","seo_title","seo_description","available_locales":["en","ar"]}
SeriesOut = {"slug","title","description_html","cover_image_url",
             "books":[{"slug","title","description_html","cover_image_url","purchase_url"}]}
```

### Order & report lifecycle
```
awaiting_payment ──(verified payment event)──► paid ──(same txn: enqueue generate_report)──► queued
queued ──worker──► generating ──6 sections ok + PDF──► ready ──(access window over)──► expired
generating ──permanent failure──► generation_failed (admin can retry)      awaiting_payment ──48h──► abandoned
refund event ──► refunded (report access revoked)
```
* Payment confirmation (`app.payments.service.confirm_payment`) is idempotent: payment events are
  unique per `(provider, event_id)`; the order row is locked (`SELECT … FOR UPDATE`); amount and
  currency are checked against the order; the generate job uses `dedupe_key="generate_report:<order_id>"`.
  A success redirect is never treated as proof of payment.
* Generation (`app.generation.jobs.handle_generate_report`): snapshot the 6 published prompt versions on
  first run (`orders.prompt_version_ids`), then for slots 1..6 render the template with
  `generation.templating.chart_variables(chart, locale, display_name)`, call the AI client, count words
  (`generation.words.count_words`), re-ask while `< min_words` up to `max_attempts_per_prompt`, persist
  each successful section immediately (never regenerated), pause `uniform(prompt_delay_min, prompt_delay_max)`
  seconds between calls. Transient AI errors → job retry with backoff (completed sections kept).
  Then call `app.reports.service.build_report(db, order)`.
* `build_report` renders the PDF (Chromium via Playwright, HTML template with logo, header & footer,
  RTL for Arabic), stores it privately as `<64 hex chars>.pdf` (`security.new_report_file_key`),
  creates `reports` row with `expires_at = now + report_access_hours`, sets order `ready`, and enqueues
  `send_report_email`.
* `send_report_email` generates a fresh email token (hash stored on `reports.email_token_hash`) and emails
  the link `{site_url}/{locale}/report/{order_id}#t={token}` (fragment → never sent to servers/logs).
  The PDF is attached only if setting `email_attach_pdf` is true (attachments cannot expire).
* `cleanup` (every 10 min): delete expired report files → order `expired`; unpaid orders older than
  `abandoned_order_hours` → `abandoned`; purge birth data after `personal_data_retention_days`; delete
  expired admin sessions, old login attempts and finished jobs.

### Frontend routes these URLs rely on
`/{locale}` home · `/{locale}/free` · `/{locale}/reading` (paid form) · `/{locale}/order/{id}` (status +
download; access token kept in `localStorage["zb_order_<id>"]`) · `/{locale}/report/{id}#t=…` (email link) ·
`/{locale}/checkout/fake?order={id}` (dev payment page) · `/{locale}/offers` · `/{locale}/offers/{slug}` ·
`/{locale}/blog` · `/{locale}/blog/{slug}` · `/{locale}/library` · `/{locale}/library/{slug}` ·
`/{locale}/privacy` · `/{locale}/terms` · `/{locale}/contact` · `/admin/...`.
Stripe `success_url = {site_url}/{locale}/order/{id}?paid=1`, `cancel_url = …?cancelled=1`.

## 6. Admin API (`/api/v1/admin`)

| Area (role) | Endpoints |
|---|---|
| Auth (public→any) | `POST /auth/login {email,password,totp_code?}` → `{"user"}` + cookie; 401 `invalid_credentials`, 401 `mfa_required`, 429 · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password {current_password,new_password}` · `POST /auth/mfa/setup` → `{secret,otpauth_url}` · `POST /auth/mfa/enable {code}` · `POST /auth/mfa/disable {password,code}` |
| Users (owner) | `GET /users` · `POST /users {email,name,role,password}` · `PATCH /users/{id} {name?,role?,is_active?,password?}` · `DELETE /users/{id}` (deactivates) |
| Audit (manager) | `GET /audit-logs?page&entity_type&user_id` |
| Site content (editor) | `GET /site-content?locale` → `{"locale","items":{key:value},"keys":[...all known keys]}` · `PUT /site-content {locale, items:{key:value}}` |
| Free readings (editor) | `GET /free-readings?kind&locale` · `PUT /free-readings/{kind}/{key}/{locale} {title,body}` |
| Offers (editor) | `GET/POST /offers` · `GET/PATCH/DELETE /offers/{id}` |
| Discounts (manager) | `GET/POST /discounts` · `GET/PATCH/DELETE /discounts/{id}` (delete = deactivate if used) |
| Library (editor) | `GET/POST /book-series` · `GET/PATCH/DELETE /book-series/{id}` · `POST /book-series/{id}/books` · `PATCH/DELETE /books/{id}` |
| Blog (editor) | `GET /blog-posts?status&page` · `POST /blog-posts` · `GET/PATCH/DELETE /blog-posts/{id}` · `POST /blog-posts/{id}/publish` · `POST /blog-posts/{id}/unpublish` |
| Media (editor) | `POST /media` (multipart `file`, jpeg/png/webp/gif ≤ 5 MB) → `{id,url,...}` · `GET /media?page` · `DELETE /media/{id}` |
| Markdown (editor) | `POST /markdown/preview {markdown}` → `{html}` |
| Settings (manager) | `GET /settings` → `{"values":{...},"defaults":{...}}` · `PUT /settings {"values":{...}}` |
| Prompts (manager) | `GET /prompts` → `{"slots":[{slot,published,draft,versions_count}]}` · `GET /prompts/variables` · `GET /prompts/{slot}/versions` · `POST /prompts/{slot}/versions` (new draft) · `PATCH /prompts/versions/{id}` (drafts only) · `POST /prompts/versions/{id}/publish` · `POST /prompts/versions/{id}/preview {locale}` → `{rendered_prompt}` · `POST /prompts/versions/{id}/test {locale}` → `{output,word_count,model}` |
| Orders (manager) | `GET /orders?status&q&page` · `GET /orders/{id}` · `POST /orders/{id}/retry-generation` · `POST /orders/{id}/resend-email` · `POST /orders/{id}/extend-access {hours}` · `GET /dashboard` · `GET /jobs?status` · `POST /jobs/{id}/retry` |

List endpoints return `{"items":[...],"total":N,"page":1,"page_size":20}`.

## 7. Prompt template variables
Templates are sandboxed Jinja2 (`{{ sun_sign }}`), see `app/generation/templating.py`:
`language, locale, name, sun_sign, sun_degree, moon_sign, moon_degree, ascendant, ascendant_degree,
sun_on_cusp, year_animal, year_element, year_polarity, year_pillar, month_animal, month_element,
month_pillar, day_animal, day_element, day_pillar, hour_animal, hour_element, hour_pillar, day_master`.
The email address is never sent to the AI provider.

## 8. Configuration (env, prefix `ZB_`)
See `backend/app/config.py` and `backend/.env.example`. Key ones: `ZB_DATABASE_URL`, `ZB_SITE_URL`,
`ZB_PAYMENT_PROVIDER` (`stripe`|`fake`), `ZB_STRIPE_SECRET_KEY`, `ZB_STRIPE_WEBHOOK_SECRET`,
`ZB_AI_PROVIDER` (`gemini`|`fake`), `ZB_GEMINI_API_KEY`, `ZB_EMAIL_BACKEND` (`smtp`|`console`), `ZB_SMTP_*`,
`ZB_CHROMIUM_EXECUTABLE`, `ZB_COOKIE_SECURE`. Business settings (price, prompt delays, min words, model,
access hours, calculation conventions, retention) are edited in the dashboard (`settings_store.DEFAULTS`).

## 9. Open client decisions (defaults chosen, all configurable)
1. Slogan: images say "Two Traditions. One Truth." (used); brief says "Two Culture One Truth".
2. Chinese year boundary: Lichun (BaZi) by default; Lunar New Year selectable.
3. "Animal = year - month - day": implemented as the year/month/day (and hour) pillars of BaZi.
4. Free plan: Western sun sign + Chinese year animal, two pre-written readings (12 + 12 per language).
5. Cities: full city list with coordinates (the Ascendant depends on location). For single-time-zone
   countries the capital is pre-selected, satisfying the brief while allowing accurate birthplaces.
6. Payment provider: Stripe Checkout implemented behind an interface (`fake` provider for testing).
7. Galaxy Library books link to an external purchase URL until selling/shipping is specified.
8. Report link: 24 h from when the report is ready; email contains a link (not an attachment).

## 10. As-built notes (details beyond the tables above)

### Chinese calendar (§4.3)
* The 23:00–23:59 hour is the 子 hour of the **next** day in both settings, so its hour stem comes from
  the next day's stem. With `day_boundary="midnight"` the day pillar stays on the current day
  (lunar-python sect 2, 夜子时); with `"zi_23"` the day pillar is already the next day's (sect 1).
* `year_pillar_for_date` returns an alternative animal when the Lichun instant falls inside
  `[d 00:00 UTC+14, d+1 00:00 UTC−12)`, or, in `lunar_new_year` mode, when `d` is the Chinese New Year
  date (China calendar) or the day before it. `lunar_new_year` changes the year at 00:00 Beijing time.
* Supported years 1800–2200 (`ValueError` outside). Helpers in `app.chinese.solar_terms`:
  `nearest_jie(instant)`, `lichun_instant(year)`, `chinese_new_year(year)`, `jie_terms(year)`.

### Geography (§5)
* `admin1` is only populated for US cities (state names); other countries have none in the dataset.
* `GET /geo/countries` lists countries that have cities. City labels use the localised country name;
  the Arabic separator is `، `. `app.geo.service.get_city_out(db, city_id, locale)` builds the label.
* Place data © GeoNames (geonames.org), CC BY 4.0 — attribution is shown in the site footer.

### Admin auth (§6)
* `POST /auth/login` also requires `X-ZB-Admin: 1` (403 `csrf_failed`); may return 401 `invalid_mfa_code`.
* `GET /auth/me`, `POST /auth/mfa/enable`, `POST /auth/mfa/disable` → `{"user": AdminUserOut}`;
  `POST /auth/logout`, `POST /auth/password` → `{"ok": true}`. Account forms return 422
  `invalid_password` / `invalid_mfa_code` with `details.fields`. MFA state errors: 409
  `mfa_already_enabled`, `mfa_setup_required`, `mfa_not_enabled`.
* `AdminUserOut = {id,email,name,role,mfa_enabled,last_login_at}`. Users endpoints return
  `ManagedUserOut = AdminUserOut + {is_active,created_at,updated_at}` (POST → 201). `PATCH /users/{id}`
  accepts `reset_mfa: true`. Errors: 409 `email_taken`, 409 `last_owner`, 403 `self_change_forbidden`.
* `GET /audit-logs` accepts `page_size` (≤100) and `action`; items
  `{id,created_at,user_id,user_email,action,entity_type,entity_id,data,ip}`.
* Throttling: 5 failed logins per email or 30 per IP within 15 minutes → 429. TOTP codes cannot be
  replayed (last accepted step stored on the user). Lost authenticator: `python -m app.cli reset-mfa`.
* `ZB_TRUST_PROXY_HEADERS` assumes the API is reachable **only** through the Next.js proxy.

### Prompts (§6)
* Extra endpoints: `GET /prompts/versions/{id}`, `DELETE /prompts/versions/{id}` (drafts only).
* New-draft body fields are optional (`name, section_titles, template, system_instruction, min_words,
  notes, base_version_id`); omitted fields are copied from the base / published / latest version.
* Preview accepts unsaved `template` / `system_instruction`; response adds `locale` and
  `rendered_system_instruction`. Test response adds `output_html`, `min_words`, `finish_reason`.
* `GET /prompts/variables` → `{locale, items:[{name, description, example}]}`.
* Errors: 409 `draft_exists` / `not_draft`, 422 `invalid_template` (`details.field`), 422
  `template_required`, 422 `invalid_base_version`, 503 `ai_unavailable` / `ai_not_configured`,
  502 `ai_error`, 429 `rate_limited`. The system instruction is rendered as a template too.

### Generation
* Re-running a generate job for a `generation_failed` order resumes it: finished sections are kept.
  Admin "retry generation" resets the existing `generate_report:<order_id>` job row.
* `gemini_timeout_seconds` (≤ 240) plus the prompt delay must stay below `ZB_JOB_LEASE_SECONDS`
  (default 300); the lease is extended before every AI call and an advisory lock prevents double runs.
