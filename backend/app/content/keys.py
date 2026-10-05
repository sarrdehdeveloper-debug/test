"""Canonical list of editable site-content keys.

The frontend reads these keys from ``GET /api/v1/site-content`` (falling back to its own
messages when a value is empty); the dashboard shows them as editable fields; the seed loader
fills English and Arabic values. ``format``:

* ``text``      single line / short paragraph, rendered as plain text
* ``lines``     one item per line (e.g. feature bullet lists)
* ``markdown``  rich text; the public API also returns sanitised HTML for it
"""

from __future__ import annotations

from typing import Literal, NamedTuple

Format = Literal["text", "lines", "markdown"]


class ContentKey(NamedTuple):
    key: str
    format: Format
    group: str
    description: str


def _k(key: str, fmt: Format, description: str) -> ContentKey:
    return ContentKey(key, fmt, key.split(".")[0], description)


SITE_CONTENT_KEYS: tuple[ContentKey, ...] = (
    # Home — hero
    _k("home.hero.eyebrow", "text", "Small line above the hero title"),
    _k("home.hero.title", "text", "Hero title"),
    _k("home.hero.subtitle", "text", "Hero subtitle"),
    _k("home.hero.cta_free", "text", "Hero button: free reading"),
    _k("home.hero.cta_paid", "text", "Hero button: full report"),
    # Home — the two traditions
    _k("home.traditions.title", "text", "Section title: the two traditions"),
    _k("home.traditions.western.title", "text", "Western astrology card title"),
    _k("home.traditions.western.body", "text", "Western astrology card text"),
    _k("home.traditions.chinese.title", "text", "Chinese zodiac card title"),
    _k("home.traditions.chinese.body", "text", "Chinese zodiac card text"),
    _k("home.traditions.blend.title", "text", "The blend card title"),
    _k("home.traditions.blend.body", "text", "The blend card text"),
    # Home — how it works
    _k("home.how.title", "text", "Section title: how it works"),
    _k("home.how.step1.title", "text", "Step 1 title"),
    _k("home.how.step1.body", "text", "Step 1 text"),
    _k("home.how.step2.title", "text", "Step 2 title"),
    _k("home.how.step2.body", "text", "Step 2 text"),
    _k("home.how.step3.title", "text", "Step 3 title"),
    _k("home.how.step3.body", "text", "Step 3 text"),
    # Home — plans
    _k("home.plans.title", "text", "Section title: plans"),
    _k("home.plans.free.title", "text", "Free plan title"),
    _k("home.plans.free.body", "text", "Free plan description"),
    _k("home.plans.free.features", "lines", "Free plan features, one per line"),
    _k("home.plans.paid.title", "text", "Full report title"),
    _k("home.plans.paid.body", "text", "Full report description"),
    _k("home.plans.paid.features", "lines", "Full report features, one per line"),
    # Home — library, blog, FAQ, final CTA
    _k("home.library.title", "text", "Galaxy Library teaser title"),
    _k("home.library.body", "text", "Galaxy Library teaser text"),
    _k("home.blog.title", "text", "Blog teaser title"),
    _k("home.blog.body", "text", "Blog teaser text"),
    _k("home.faq.title", "text", "FAQ title"),
    *(_k(f"home.faq.q{i}", "text", f"FAQ question {i}") for i in range(1, 7)),
    *(_k(f"home.faq.a{i}", "text", f"FAQ answer {i}") for i in range(1, 7)),
    _k("home.cta.title", "text", "Closing call-to-action title"),
    _k("home.cta.body", "text", "Closing call-to-action text"),
    # Free & paid forms
    _k("free.intro.title", "text", "Free reading page title"),
    _k("free.intro.body", "text", "Free reading page intro"),
    _k("reading.intro.title", "text", "Full report page title"),
    _k("reading.intro.body", "text", "Full report page intro"),
    _k("reading.includes", "lines", "What the full report includes, one per line"),
    _k("reading.privacy_note", "text", "Short privacy note under the paid form"),
    # Offers, library and blog pages
    _k("offers.intro.title", "text", "Offers page title"),
    _k("offers.intro.body", "text", "Offers page intro"),
    _k("library.intro.title", "text", "Galaxy Library page title"),
    _k("library.intro.body", "text", "Galaxy Library page intro"),
    _k("blog.intro.title", "text", "Blog page title"),
    _k("blog.intro.body", "text", "Blog page intro"),
    # Legal & contact
    _k("legal.disclaimer", "text", "Short disclaimer (readings are for reflection/entertainment)"),
    _k("legal.privacy.body", "markdown", "Privacy policy"),
    _k("legal.terms.body", "markdown", "Terms of service"),
    _k("contact.body", "markdown", "Contact page text"),
    # Company & footer
    _k("company.name", "text", "Legal company name"),
    _k("company.address", "text", "Postal address"),
    _k("company.phone", "text", "Phone number"),
    _k("company.email", "text", "Public contact email"),
    _k("footer.tagline", "text", "Footer tagline"),
    # SEO
    _k("seo.home.title", "text", "Home page <title>"),
    _k("seo.home.description", "text", "Home page meta description"),
)

KEYS_BY_NAME: dict[str, ContentKey] = {k.key: k for k in SITE_CONTENT_KEYS}
