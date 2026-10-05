# Build progress (paused)

Work was paused on request. This file records exactly where the build stopped so it can be resumed.

## Status by module

| Module | State | Tests |
|---|---|---|
| Astronomy (Sun, Moon, Ascendant, time zones) — app/astro | ✅ done | 164 passing |
| Chinese BaZi pillars — app/chinese | ✅ done | 68 passing |
| Chart composition + free plan API — app/charts, app/free_reading | ✅ done | 142 passing |
| Countries & cities — app/geo | ✅ done | 74 passing |
| Admin login, MFA, users, audit — app/admin_auth | ✅ done | 82 passing |
| AI generation, prompts admin, worker — app/generation, app/prompts, app/worker.py | ✅ done | 134 passing |
| Free readings en/ar — app/seed/data | ✅ done | 84 passing |
| Seed loader, site copy, 6 prompts, samples — app/seed | ✅ done | 67 passing |
| Orders, pricing, payments (Stripe/fake), admin orders — app/orders, app/payments | ⏸ interrupted mid-way (partial files committed as WIP) | not verified |
| Content CMS (public + admin), media, settings — app/content | ⏸ interrupted mid-way (partial files committed as WIP) | not verified |
| PDF report, downloads, email, cleanup — app/reports | ⏸ interrupted mid-way (partial files committed as WIP) | not verified |
| Frontend foundation + home page — frontend/ | ⏸ interrupted mid-way (partial files committed as WIP) | not verified |

Not started yet: frontend pages (free/paid forms, order status, blog, library, offers, legal) and the admin dashboard UI; Alembic initial migration; integration review.

## Follow-ups reported by finished modules (to apply during integration)

### chinese-bazi
- docs/ARCHITECTURE.md §4.3 (suggested wording): (a) the 23:00-23:59 hour is the 子 hour of the next day in both settings, so its hour stem comes from the next day's stem. With day_boundary="midnight" the day pillar stays on the current day (lunar-python sect=2, 夜子时); with "zi_23" it is already the next day's (sect=1). (b) year_pillar_for_date returns an alternative animal when the Lichun instant falls inside [d 00:00 UTC+14, d+1 00:00 UTC-12), or, in lunar_new_year mode, when d is the Chinese New Year date (China calendar) or the day before it. (c) lunar_new_year mode changes the year at 00:00 Beijing time on New Year's day; the month pillar still follows solar terms. (d) Supported years are 1800-2200; outside that range a ValueError is raised.
- Optionally list in ARCHITECTURE §4.3 the helpers in app.chinese.solar_terms that other modules may use: nearest_jie(instant) -> SolarTerm (charts/service can raise a "near_solar_term_boundary" warning when abs(nearest_jie(utc).instant - utc) is under a threshold, for example 1 hour), lichun_instant(year), chinese_new_year(year) and jie_terms(year).

### charts-free
- app/utils.py ip_hash() is an unkeyed SHA-256 of 'zb-ip:<ip>'. The whole IPv4 space (2^32) can be hashed in minutes, so the stored free_reading_requests.ip_hash can be turned back into the IP. Suggestion: add a secret to config.py (e.g. `ip_hash_secret: str` from ZB_IP_HASH_SECRET, required in production) and use hmac.new(secret, ip, sha256).hexdigest(). The function signature stays the same, so no caller changes.
- Note for the orders module owner (no change to shared files needed): catch app.charts.service.BirthDateOutOfRange and return 422 'birth_date_out_of_range' (it has .earliest and .latest for details). build_chart also raises it when the birth instant is in the future, e.g. today at 23:00. It raises ValueError for an unknown time zone, bad coordinates or bad fold, and AmbiguousLocalTime / NonexistentLocalTime unchanged.
- Note for the owner of GET /public-config: use app.charts.service.MIN_BIRTH_DATE for 'min_birth_date' rather than a second hard-coded copy.
- Note for reports/jobs.py (_purge_order) and anyone reading orders.chart: after the retention purge, chart['input'] is {}. Chart.model_validate(order.chart) then fails, because ChartInput's fields are required. Code that re-validates purged charts (admin order detail, OrderStatusOut.signs, generation retries) should read chart['western'] and chart['chinese'] directly, or the purge could keep a stub input. Changing ChartInput to optional fields in charts/schemas.py would be the alternative.

### admin-auth
- app/models.py AdminUser: add `totp_last_used_step: Mapped[int | None] = mapped_column(BigInteger)` so TOTP replay protection works across multiple API processes (currently an in-process guard in admin_auth/service.py; once the column exists, service.verify_totp should compare/update it under the row lock instead).
- app/models.py LoginAttempt: add `Index("ix_login_attempts_ip_created", "ip", "created_at")` to __table_args__; the per-IP throttle query filters on ip + created_at on every login.
- docs/ARCHITECTURE.md section 6 Auth/Users/Audit rows: document response shapes and codes: GET /auth/me, POST /auth/mfa/enable and /auth/mfa/disable -> {"user": AdminUserOut}; POST /auth/logout and /auth/password -> {"ok": true}; POST /auth/login also requires header X-ZB-Admin: 1 (403 csrf_failed) and may return 401 invalid_mfa_code; /auth/password and /auth/mfa/disable return 422 invalid_password / 422 invalid_mfa_code with details.fields and can return 429; 409 mfa_already_enabled / mfa_setup_required / mfa_not_enabled; users endpoints return ManagedUserOut {id,email,name,role,mfa_enabled,last_login_at,is_active,created_at,updated_at} directly (POST 201); PATCH /users/{id} also accepts optional reset_mfa: true; 409 email_taken, 409 last_owner, 403 self_change_forbidden; GET /audit-logs also accepts page_size (<=100) and action; items {id,created_at,user_id,user_email,action,entity_type,entity_id,data,ip}.
- Frontend admin login: must send header `X-ZB-Admin: 1` on POST /api/v1/admin/auth/login as well; on 401 mfa_required show the code field and resend email+password+totp_code; treat 422 invalid_password/invalid_mfa_code on account pages as form errors (not logout).
- Cleanup job (reports module): when purging old login_attempts keep at least the last 15 minutes (LOGIN_WINDOW in app/admin_auth/service.py); 24h+ retention recommended for forensics.
- app/cli.py (optional): add `reset-mfa --email E` command (clear totp_secret/totp_pending_secret, delete that user's admin_sessions) so a sole owner who loses their authenticator can recover; the API's PATCH reset_mfa deliberately refuses to act on the caller themself.
- Deployment note (config/docs): trust_proxy_headers defaults to True, so if the API port is reachable directly (not only via the Next.js proxy) X-Forwarded-For can be spoofed to dodge the per-IP login limit (the per-email limit still applies). Production should expose the API only behind the proxy, and the proxy must set X-Forwarded-For.

### geo
- app/models.py (optional perf): add a partial index for capitals on City.__table_args__: Index("ix_cities_capital", "country_code", postgresql_where=text("is_capital")). The country list scans all cities for is_capital (about 30 ms at min_population=500, about 5 ms at 15000).
- app/models.py (optional, only if importing min_population=500 at scale): a pg_trgm GIN index on cities.search_text (Index("ix_cities_search_trgm", "search_text", postgresql_using="gin", postgresql_ops={"search_text": "gin_trgm_ops"}) plus CREATE EXTENSION pg_trgm in the migration). Current worst case without it is about 70 ms per search on the US.
- app/cli.py: for the import-geo subcommand use p.add_argument("--min-population", type=int, default=15000, choices=[500, 1000, 5000, 15000]) so an invalid value gives a clean argparse error instead of a ValueError traceback (app.geo.importer.SUPPORTED_MIN_POPULATIONS).
- docs/ARCHITECTURE.md §5 City shape: note that admin1 is only populated for US (state names); geonamescache has no admin1 names elsewhere, so the 'Cairo Governorate' example is not produced. Note that City.name is localised when cities.names[locale] exists, labels use the localised country name, US labels include the state, and the Arabic label separator is '، '. Also note GET /geo/countries lists only countries that have cities. Optionally document app.geo.service.get_city_out(db, city_id, locale) -> CityOut | None for the orders module (place_label).
- Frontend / site content owners: GeoNames data is CC-BY 4.0, so the public site must show an attribution such as 'Place data © GeoNames (geonames.org), CC BY 4.0' (footer or credits page).

### generation-worker
- app/db.py: pass `hide_parameters=settings.is_production` to `create_engine`. SQLAlchemy error messages and log lines embed bound parameters (birth data, emails, token hashes), and PostgreSQL's own error text quotes offending values. The worker cleans `jobs.last_error`, but other exception logs (FastAPI, other modules) still print the parameters.
- docs/ARCHITECTURE.md §6 Prompts row: document the additions. (1) `GET /prompts/versions/{id}` and `DELETE /prompts/versions/{id}` (drafts only). (2) The POST draft body takes optional `name, section_titles, template, system_instruction, min_words, notes, base_version_id`; omitted fields are copied from the base, published or latest version. (3) Preview body takes optional `template`/`system_instruction` (unsaved editor text); the response adds `locale` and `rendered_system_instruction`. (4) Test response adds `output_html`, `min_words`, `finish_reason`. (5) `GET /variables` returns `{locale, items:[{name, description, example}]}`. (6) Error codes: `draft_exists` 409, `not_draft` 409, `invalid_template` 422 (details.field = template|system_instruction), `template_required` 422, `invalid_base_version` 422, `ai_unavailable` 503, `ai_error` 502, `ai_not_configured` 503, `rate_limited` 429. (7) `system_instruction` is also rendered as a sandboxed template with the same variables; the seeded plain-text instruction renders unchanged.
- docs/ARCHITECTURE.md lifecycle: when a generate job runs again for a `generation_failed` order, it resumes (finished sections are kept). Orders agent, for `POST /admin/orders/{id}/retry-generation`: the original job already uses `dedupe_key=generate_report:<order_id>`, so reset that existing job row (status=pending, attempts=0, run_at=now, last_error=null) and set the order to `queued`. Enqueuing a new job with the same key would be silently dropped by ON CONFLICT DO NOTHING.
- Orders agent: `app.generation.service.count_done_sections(db, order_id)` and `SECTIONS_TOTAL` (6) are available for `OrderStatusOut.progress`. A section with status `failed` holds the last short reply in `content` and the reason in `last_error`.
- Reports agent: `build_report(db, order)` is called while `order.status == generating` with all 6 sections DONE, and the handler commits after it returns. Raise `app.jobs.registry.PermanentJobError` for non-retryable problems (the order then becomes generation_failed); any other exception is retried with backoff without new AI calls.
- settings_store / config: the AI call timeout (`gemini_timeout_seconds`, validator allows up to 600) plus `prompt_delay_max_seconds` should stay below `ZB_JOB_LEASE_SECONDS` (default 300). The lease is now extended before every AI call, and the advisory lock prevents double generation anyway, but a lease shorter than one call makes other workers re-claim the job and burn attempts on OrderBusyError. Consider capping the timeout validator at about 240 s or documenting the relation.
- Frontend admin prompts page: use the response shapes above. Only one draft per slot is allowed: offer 'edit draft', 'discard draft' (DELETE) and 'new draft from published'. Show `invalid_template` messages next to the field named in `details.field`.

### seed-readings
- No code changes to shared files are needed.
- Deployment/packaging owner: the new non-Python files backend/app/seed/data/free_readings_en.json and free_readings_ar.json must ship with the app (copied into the Docker image, or added as package data if a wheel is ever built, since pyproject.toml has no package-data config). Otherwise `python -m app.cli seed` will quietly skip free readings.

### seed-site
- Privacy gap (reports/cleanup owner): orders.chart['input'] still holds local_datetime, utc_datetime, latitude, longitude and place_label. Unless the retention purge also clears that 'input' object, birth data survives past personal_data_retention_days, and the privacy policy's '30 days' claim would be false.
- Content admin owner: when an admin saves an empty value for a site-content key, store "" and do not delete the row. Otherwise the seed that runs on every deploy re-inserts the default text. The same applies to free readings.
- settings_store.DEFAULTS: gemini_max_output_tokens=2048 is tight. The prompts ask for 350–550 words, and in Arabic that is about 1,100–1,500 tokens. On gemini-2.5-flash, thinking tokens count against this limit, so sections could be cut off. Suggest raising the default to 8192, or having the generation module set a small thinking_budget.
- app/generation/templating.py sample_variables(): two preview facts contradict their pillars. month_pillar 甲申 is given month_element 'Earth' but 甲 is Wood, and hour_pillar 庚辰 is given hour_element 'Fire' but 庚 is Metal. Suggest month_element='Wood' and hour_element='Metal' so dashboard previews stay consistent.
- Orders module: strip newlines and control characters from display_name and cap its length before it reaches chart_variables. The templates already tell the model to treat the name as data only.
- Frontend: the launch offer's cta_url is seeded as '/reading' (no locale, as specified), so the frontend must add the current locale to site-relative cta_url values.

## Open questions for the client

- (astro-western) Inside the polar circles (|latitude| > 66.56°), the usual Ascendant formula sometimes gives the setting point. I always return the point rising in the east, which is the usual astrology convention. Is that acceptable? It only affects cities such as Tromsø and Longyearbyen.
- (astro-western) The UI and messages could say that a birth date is ambiguous when it is two-sign. sun_sign_for_date treats a date as two-sign if the Sun changes sign at any moment of that date anywhere on Earth (UTC+14 to UTC-12). That gives 2 dates per sign change, 24 dates in 2024. For example, 19 March 2024 returns (pisces, aries), because it was already Aries late that evening in Hawaii. The free-plan text should explain that the birth time is needed to be sure.
- (astro-western) Birth times use the civil clock time of the birthplace (UTC from the IANA time-zone database), not true local solar time. That is the standard approach and matches the Chinese module (§4.3); I'm noting it for the client's documentation.
- (chinese-bazi) For births between 23:00 and 23:59, which day-pillar rule do you follow? The default is "midnight": the day pillar stays on the current day and the hour pillar is the next day's 子 hour, the classical 夜子时 rule. The alternative, "zi_23", starts the new day at 23:00. Both are already available as a setting.
- (chinese-bazi) Should we apply a true solar time correction? At the moment the hour and day pillars use the birthplace's clock time. In places far from their time zone's reference meridian, or during summer time, this can move the hour pillar by one branch.
- (chinese-bazi) In "lunar_new_year" mode the year changes on Chinese New Year's day by Beijing time. Communities that keep New Year by their own local date (for example Vietnamese Tết, which is based on UTC+7) can differ in rare years. Is following China's date acceptable?
- (chinese-bazi) On the free plan, a birth date on the Lichun or Chinese New Year boundary (about 2 dates a year) returns a second possible animal. How should the page word this: show both animals, or ask for the birth time?
- (charts-free) Free plan on a cusp date (e.g. born 20 March, when the Sun may be in Pisces or Aries depending on the time): the API returns the most likely sign plus 'sun_sign_alternative' but only one reading. Should the page show both readings, show a note, or ask for the birth time? The same question applies to the Chinese year near Lichun or Chinese New Year.
- (charts-free) Chinese year for the free plan: the default is Lichun (around 4 February, the BaZi rule). Most popular zodiac sites use Chinese New Year (late January to February), so someone born on 5 February 2024 is a Dragon under Lichun but still a Rabbit under New Year. Which should the free plan use, and should it always match the paid report?
- (charts-free) Free-plan leads store the email, birth date, signs and marketing consent. The birth date is erased after personal_data_retention_days (30 by default). Is that retention acceptable, and what consent wording should appear next to the marketing checkbox?
- (charts-free) The free-reading limit defaults to 30 requests per hour per IP address. Offices or mobile networks that share one IP could reach it. Is 30 per hour right? It can be changed in the dashboard settings.
- (admin-auth) Should MFA be mandatory for owners (or all admins)? Currently MFA is optional per user.
- (admin-auth) Lockout policy: 5 failed attempts per email in 15 minutes also lets anyone lock a known admin email out for 15 minutes. Is that acceptable, or would you prefer progressive delays or a CAPTCHA?
- (admin-auth) models.py says the 'admin' role can do 'everything except managing owners', but the contract makes user management owner-only. Should admins be able to create and manage editors?
- (admin-auth) Admin sessions last 12 hours from login regardless of activity. Do you also want an idle timeout or a 'remember me' option?
- (admin-auth) Should successful admin logins and logouts also be written to the audit log? Today they only go to login_attempts, which the cleanup job purges.
- (geo) City coverage: default import is cities with population >= 15000 (about 34k cities). Importing >= 500 (about 235k cities, about 18 s) covers small towns and villages, which matters for an accurate Ascendant. Which threshold does the client want in production?
- (geo) Country names come from the standard Unicode CLDR list (e.g. 'Congo - Kinshasa', 'Hong Kong SAR China', 'Palestinian Territories' / 'الأراضي الفلسطينية'). Are these acceptable for the Arabic and English audience, or does the client want custom names for politically sensitive territories (PS, EH, TW, IL, XK)?
- (geo) City names are shown in their GeoNames (Latin-script) form even on the Arabic site, because geonamescache's alternate names are not language-tagged; Arabic search still works. Should we add proper Arabic city names, e.g. from the full GeoNames alternateNamesV2 file or a curated list of major Arab cities?
- (geo) Should labels outside the US include the region (e.g. Egyptian governorate) to tell apart cities with the same name? That needs the GeoNames admin1CodesASCII file, which geonamescache does not include.
- (generation-worker) If a section is still under the word minimum after all attempts (default 3), the whole order currently becomes generation_failed so an admin can review and retry, and the customer gets no partial report. Should we instead deliver the report with the best attempt, or notify the customer automatically?
- (generation-worker) The brief's minimum is 25 words per reply. For a paid report, should the minimum be higher (e.g. 300 words per section)? It is configurable globally and per prompt.
- (generation-worker) Gemini model: the default is gemini-2.5-flash, and its thinking tokens count against `gemini_max_output_tokens` (now 8192). Please confirm the model and budget (cost per report versus quality), or whether a Pro model is wanted.
- (generation-worker) Report language: the AI writes in the order's locale (English/Arabic today). Will more languages be added? Section titles must then be entered per language for each prompt.
- (generation-worker) Token usage per section is stored (summed over retries). Does the client want a cost or usage view in the dashboard?
- (seed-readings) Arabic naming for Pig (and to a lesser extent Dog) for a mainly Muslim audience: keep 'الخنزير' as specified, or use 'الخنزير البري' (wild boar), which some Arabic zodiac sites prefer? The text itself is respectful either way.
- (seed-readings) Yin/yang convention: I used the classic branch-order polarity you gave (Rat yang … Pig yin). Some BaZi schools assign it by hidden stem instead (e.g. Rat yin water, Snake yang fire, Horse yin fire, Pig yang water). Please confirm which convention the client wants, so the paid-report prompts match.
- (seed-readings) Arabic terms for sign modality: I used the modern terms قيادي / ثابت / مرن (cardinal / fixed / mutable). The client may prefer the classical terms منقلب / ثابت / ذو جسدين.
- (seed-readings) English spelling: I used American English because the client is a US LLC. Confirm, or switch to British (colour, honour, recognise).
- (seed-readings) Arabic voice: the copy describes the sign in the third-person plural (مواليد ...) and addresses the reader only in gender-neutral ways. Is that the desired tone, or does the client prefer direct address (which forces choosing masculine or feminine forms)?
- (seed-readings) Goat vs Sheep: the key is 'goat' (الماعز), and the text notes the animal is also called the Sheep (الخروف). Confirm the preferred display name.
- (seed-readings) Recommend a final review by the client's native Arabic editor or astrologer before launch. All 48 readings can be edited later in the admin CMS (PUT /free-readings/{kind}/{key}/{locale}).
- (seed-site) Refund policy: the terms carry a placeholder. Proposed: a full refund if the report is not delivered because of a technical fault on our side, with requests within 14 days. Please confirm or replace it.
- (seed-site) Legal review of the privacy and terms drafts is still needed on: how long email addresses and order records are kept, whether the paid Gemini API tier is used (so Google does not use the data to improve its products), taxes/VAT, transfers for EU/UK visitors, Wyoming as governing law, and the minimum age of 16.
- (seed-site) Public contact email: the site shows info@zodiacblend.com. The brief also lists Admin@Zodiacblend.com. Which one should be public?
- (seed-site) Launch offer WELCOME10 (10%) is seeded with no end date and no usage limit. Please confirm the amount, the dates and any maximum number of uses.
- (seed-site) Galaxy Library: the three books (The Dragon and the Ram, The Scorpion and the Snake, The Archer and the Horse) are placeholders marked 'Coming soon'. Please send the real titles, descriptions, covers and purchase links.
- (seed-site) The client requires re-asking the AI only when a reply is under 25 words, so the prompts keep that 25-word minimum. Do you want a higher minimum (e.g. 250) to protect report quality, at the cost of more retries?

## How to resume

Say “continue” (اكمل). The remaining steps: finish orders/payments, CMS, reports and the frontend foundation; build the remaining frontend pages and the admin dashboard; generate the Alembic migration; run the full test suite, lint and `npm run build`; review and push.
