import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CtaBand } from "@/components/pages/CtaBand";
import { getOffers } from "@/components/pages/data";
import { OfferCard } from "@/components/pages/offers/OfferCard";
import { PageHero } from "@/components/pages/PageHero";
import { EmptyState, UnavailableNotice } from "@/components/pages/StatusBlocks";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

// Offers start and end on dates: refresh at least every minute (ISR), or at once via the tag.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/offers">): Promise<Metadata> {
  const { locale } = await params;
  const c = await getSiteContent(locale);
  return pageMetadata({
    locale,
    path: "/offers",
    title: c.t("offers.intro.title"),
    description: c.t("offers.intro.body"),
  });
}

export default async function OffersPage({ params }: PageProps<"/[locale]/offers">) {
  const { locale } = await params;
  const [c, result, t, ts, tc] = await Promise.all([
    getSiteContent(locale),
    getOffers(locale),
    getTranslations("offersPage"),
    getTranslations("pagesShared"),
    getTranslations("common"),
  ]);
  const offers = result.ok ? result.data.items : [];
  const now = new Date();

  return (
    <>
      <PageHero
        id="offers-title"
        seed={42}
        eyebrow={t("eyebrow")}
        title={c.t("offers.intro.title")}
        lead={c.t("offers.intro.body")}
        breadcrumbs={[{ label: ts("home"), href: "/" }, { label: c.t("offers.intro.title") }]}
        breadcrumbLabel={ts("breadcrumb")}
      />

      <Section tone="ivory" aria-label={t("listLabel")}>
        {!result.ok ? (
          <UnavailableNotice
            title={ts("unavailableTitle")}
            body={ts("unavailableBody")}
            retryHref={`/${locale}/offers`}
            retryLabel={ts("retry")}
          />
        ) : offers.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            body={t("emptyBody")}
            actions={
              <>
                <Button href="/free" icon={<ArrowIcon />}>
                  {tc("getFreeReading")}
                </Button>
                <Button href="/reading" variant="outline">
                  {tc("getFullReport")}
                </Button>
              </>
            }
          />
        ) : (
          <ul className="space-y-8 lg:space-y-10">
            {offers.map((offer, index) => (
              <li key={offer.id}>
                <OfferCard offer={offer} locale={locale} now={now} eager={index === 0} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <CtaBand />
    </>
  );
}
