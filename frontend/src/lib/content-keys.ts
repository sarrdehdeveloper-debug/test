/**
 * Mirror of backend/app/content/keys.py (editable site-content keys and their format).
 * Every key needs a default under `content.*` in messages/en.json and messages/ar.json
 * (dots = nesting), which is what the site shows when the API is down or a value is empty.
 * `npm test` checks both rules.
 */
export type ContentFormat = "text" | "lines" | "markdown";

const faq = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].flatMap((i) => [
    [`home.faq.q${i}`, "text"],
    [`home.faq.a${i}`, "text"],
  ]),
) as Record<`home.faq.${"q" | "a"}${1 | 2 | 3 | 4 | 5 | 6}`, "text">;

export const CONTENT_KEYS = {
  "home.hero.eyebrow": "text",
  "home.hero.title": "text",
  "home.hero.subtitle": "text",
  "home.hero.cta_free": "text",
  "home.hero.cta_paid": "text",
  "home.traditions.title": "text",
  "home.traditions.western.title": "text",
  "home.traditions.western.body": "text",
  "home.traditions.chinese.title": "text",
  "home.traditions.chinese.body": "text",
  "home.traditions.blend.title": "text",
  "home.traditions.blend.body": "text",
  "home.how.title": "text",
  "home.how.step1.title": "text",
  "home.how.step1.body": "text",
  "home.how.step2.title": "text",
  "home.how.step2.body": "text",
  "home.how.step3.title": "text",
  "home.how.step3.body": "text",
  "home.plans.title": "text",
  "home.plans.free.title": "text",
  "home.plans.free.body": "text",
  "home.plans.free.features": "lines",
  "home.plans.paid.title": "text",
  "home.plans.paid.body": "text",
  "home.plans.paid.features": "lines",
  "home.library.title": "text",
  "home.library.body": "text",
  "home.blog.title": "text",
  "home.blog.body": "text",
  "home.faq.title": "text",
  ...faq,
  "home.cta.title": "text",
  "home.cta.body": "text",
  "free.intro.title": "text",
  "free.intro.body": "text",
  "reading.intro.title": "text",
  "reading.intro.body": "text",
  "reading.includes": "lines",
  "reading.privacy_note": "text",
  "offers.intro.title": "text",
  "offers.intro.body": "text",
  "library.intro.title": "text",
  "library.intro.body": "text",
  "blog.intro.title": "text",
  "blog.intro.body": "text",
  "legal.disclaimer": "text",
  "legal.privacy.body": "markdown",
  "legal.terms.body": "markdown",
  "contact.body": "markdown",
  "company.name": "text",
  "company.address": "text",
  "company.phone": "text",
  "company.email": "text",
  "footer.tagline": "text",
  "seo.home.title": "text",
  "seo.home.description": "text",
} as const satisfies Record<string, ContentFormat>;

export type ContentKey = keyof typeof CONTENT_KEYS;
export const CONTENT_KEY_NAMES = Object.keys(CONTENT_KEYS) as ContentKey[];
