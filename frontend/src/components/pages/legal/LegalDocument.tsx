import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHero } from "@/components/pages/PageHero";
import { UnavailableNotice } from "@/components/pages/StatusBlocks";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { getSiteContent, type SiteContentAccessor } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { isolateLtrNumbers } from "../helpers/html";
import { resolveLegalBody } from "../helpers/legal";
import { TocNav } from "./TocNav";

export type LegalKind = "privacy" | "terms";

const KEYS = { privacy: "legal.privacy.body", terms: "legal.terms.body" } as const;
const RESERVED_IDS = ["main", "legal-title", "toc-title", "legal-questions"];

async function loadBody(kind: LegalKind, c: SiteContentAccessor) {
  const tContent = await getTranslations("content");
  return resolveLegalBody({
    fromApi: c.fromApi,
    html: c.html(KEYS[kind]),
    fallbackText: tContent(KEYS[kind]),
    reservedIds: RESERVED_IDS,
  });
}

/** Metadata of /privacy and /terms; the "temporarily unavailable" notice is never indexed. */
export async function legalMetadata(kind: LegalKind, locale: string): Promise<Metadata> {
  const [c, tNav, t] = await Promise.all([
    getSiteContent(locale),
    getTranslations("nav"),
    getTranslations("legalPage"),
  ]);
  const body = await loadBody(kind, c);
  return pageMetadata({
    locale,
    path: `/${kind}`,
    title: tNav(kind),
    description: t(kind === "privacy" ? "privacyLead" : "termsLead"),
    noIndex: !body.available,
  });
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-4 shrink-0 text-ornament transition-transform group-open:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 8 5 5 5-5" />
    </svg>
  );
}

/**
 * Long-form legal page (privacy policy, terms of service) rendered from editable site content:
 * night header, "On this page" navigation built from the h2 headings (sticky on desktop,
 * collapsible on phones) and a readable document column. The "last updated" line is whatever
 * the document itself says; nothing is invented here.
 */
export async function LegalDocument({ kind, locale }: { kind: LegalKind; locale: string }) {
  const [c, tNav, t, ts, tf] = await Promise.all([
    getSiteContent(locale),
    getTranslations("nav"),
    getTranslations("legalPage"),
    getTranslations("pagesShared"),
    getTranslations("footer"),
  ]);
  const body = await loadBody(kind, c);
  const title = tNav(kind);
  const email = c.t("company.email");

  const hero = (
    <PageHero
      id="legal-title"
      seed={kind === "privacy" ? 91 : 92}
      eyebrow={t("eyebrow")}
      title={title}
      lead={t(kind === "privacy" ? "privacyLead" : "termsLead")}
      breadcrumbs={[{ label: ts("home"), href: "/" }, { label: title }]}
      breadcrumbLabel={ts("breadcrumb")}
    />
  );

  if (!body.available) {
    return (
      <>
        {hero}
        <Section tone="ivory">
          <UnavailableNotice
            title={ts("unavailableTitle")}
            bodyHtml={isolateLtrNumbers(body.html)}
            retryHref={`/${locale}/${kind}`}
            retryLabel={ts("retry")}
            actions={
              <Button href="/contact" variant="outline">
                {t("contactCta")}
              </Button>
            }
          />
        </Section>
      </>
    );
  }

  const hasToc = body.toc.length >= 2;
  const entries = body.toc.map(({ id, text }) => ({ id, text }));

  return (
    <>
      {hero}
      {/* Not <Section>: its overflow-hidden would make the sticky contents scroll away. */}
      <section data-tone="parchment" className="bg-parchment py-14 sm:py-20 lg:py-24">
        <Container>
          <div
            className={
              hasToc
                ? "grid items-start gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[17rem_minmax(0,1fr)]"
                : undefined
            }
          >
            {hasToc ? (
              <>
                {/* Phones & tablets: collapsible contents. */}
                <details className="group rounded-2xl border border-line bg-card shadow-card lg:hidden">
                  <summary className="flex list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 font-display text-xs font-semibold tracking-[0.16em] text-accent uppercase rtl:text-base rtl:tracking-normal [&::-webkit-details-marker]:hidden">
                    {t("onThisPage")}
                    <ChevronDown />
                  </summary>
                  <nav aria-label={t("onThisPage")} className="border-t border-line px-3 pt-3 pb-4">
                    <TocNav entries={entries} />
                  </nav>
                </details>
                {/* Desktop: sticky sidebar. */}
                <nav
                  aria-labelledby="toc-title"
                  className="sticky top-28 hidden max-h-[calc(100dvh-8.5rem)] overflow-y-auto pe-2 lg:block"
                >
                  <h2 id="toc-title" className="eyebrow mb-4 ps-3">
                    {t("onThisPage")}
                  </h2>
                  <TocNav entries={entries} />
                </nav>
              </>
            ) : null}

            <div className="min-w-0">
              <Card
                as="article"
                aria-labelledby="legal-title"
                padding="none"
                className="px-6 py-8 sm:px-10 sm:py-12 lg:px-14"
              >
                <div
                  className="prose-zb max-w-[72ch] text-[1.0625rem] rtl:text-[1.15rem] rtl:leading-[2] [&_blockquote]:rounded-xl [&_blockquote]:bg-gold-pale/40 [&_blockquote]:py-3 [&_blockquote]:pe-4 [&_blockquote]:text-[1.05em] [&_h2]:mt-12 [&_h2]:border-t [&_h2]:border-line [&_h2]:pt-10 [&_h2]:text-[1.65rem]"
                  dangerouslySetInnerHTML={{ __html: isolateLtrNumbers(body.html) }}
                />
              </Card>

              <aside
                aria-labelledby="legal-questions"
                data-tone="night"
                className="relative mt-8 flex flex-col items-start gap-5 overflow-hidden rounded-2xl bg-night-sky px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-10"
              >
                <div>
                  <h2 id="legal-questions" className="font-serif text-2xl font-semibold text-ivory">
                    {t("questionsTitle")}
                  </h2>
                  <p className="mt-1 text-mist">
                    {t("questionsBody")}
                    {email ? (
                      <>
                        {" "}
                        <span className="sr-only">{tf("email")}: </span>
                        <a
                          href={`mailto:${email}`}
                          dir="ltr"
                          className="font-medium text-gold-light underline decoration-gold-light/40 underline-offset-4 hover:decoration-current"
                        >
                          {email}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <Button href="/contact" variant="outline" icon={<ArrowIcon />} className="shrink-0">
                  {t("contactCta")}
                </Button>
              </aside>

              <p className="mt-8 text-center">
                <a
                  href="#main"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                >
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 16V4m-5 5 5-5 5 5" />
                  </svg>
                  {ts("backToTop")}
                </a>
              </p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
