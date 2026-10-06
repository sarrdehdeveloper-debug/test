import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GoldRule, Sparkle } from "@/components/decor/Ornament";
import { BackLink } from "@/components/pages/BackLink";
import { CodeChip } from "@/components/pages/CodeChip";
import { getOffer, getOffers } from "@/components/pages/data";
import { endsSoon } from "@/components/pages/helpers/dates";
import { htmlSummary } from "@/components/pages/helpers/html";
import { isValidSlug } from "@/components/pages/helpers/seo";
import { CelestialArt } from "@/components/pages/CelestialArt";
import { applyCodeHref, offerCtaHref, OfferValidity } from "@/components/pages/offers/OfferCard";
import { PageHero } from "@/components/pages/PageHero";
import { UnavailableNotice } from "@/components/pages/StatusBlocks";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MediaImage } from "@/components/ui/MediaImage";
import { Section } from "@/components/ui/Section";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;

/** Live offers are prerendered when the API is reachable at build time; others render on demand. */
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const result = await getOffers(params.locale);
  return result.ok ? result.data.items.map((offer) => ({ slug: offer.slug })) : [];
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/offers/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidSlug(slug)) return {};
  const result = await getOffer(slug, locale);
  if (!result.ok) {
    if (result.error.isNotFound) return {};
    const ts = await getTranslations("pagesShared");
    return { title: ts("unavailableTitle"), robots: { index: false, follow: true } };
  }
  const offer = result.data;
  return pageMetadata({
    locale,
    path: `/offers/${offer.slug}`,
    title: offer.title,
    description: offer.subtitle || htmlSummary(offer.body_html),
    ...(offer.image_url ? { images: [{ url: offer.image_url, alt: offer.title }] } : {}),
  });
}

export default async function OfferPage({ params }: PageProps<"/[locale]/offers/[slug]">) {
  const { locale, slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const [result, c, t, to, ts, tc] = await Promise.all([
    getOffer(slug, locale),
    getSiteContent(locale),
    getTranslations("offersPage"),
    getTranslations("offers"),
    getTranslations("pagesShared"),
    getTranslations("common"),
  ]);
  if (!result.ok && result.error.isNotFound) notFound();

  const offersTitle = c.t("offers.intro.title");
  if (!result.ok) {
    return (
      <>
        <PageHero
          id="offer-title"
          seed={43}
          eyebrow={t("eyebrow")}
          title={offersTitle}
          breadcrumbs={[
            { label: ts("home"), href: "/" },
            { label: offersTitle, href: "/offers" },
          ]}
          breadcrumbLabel={ts("breadcrumb")}
        />
        <Section tone="ivory">
          <UnavailableNotice
            title={ts("unavailableTitle")}
            body={ts("unavailableBody")}
            retryHref={`/${locale}/offers/${slug}`}
            retryLabel={ts("retry")}
            actions={
              <Button href="/offers" variant="outline">
                {t("allOffers")}
              </Button>
            }
          />
        </Section>
      </>
    );
  }

  const offer = result.data;
  const code = offer.discount_code;
  const soon = endsSoon(offer.ends_at, new Date());
  const ctaLabel = offer.cta_label || (offer.cta_url ? to("cta") : tc("getFullReport"));

  return (
    <>
      <PageHero
        id="offer-title"
        seed={43}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Sparkle className="size-3" />
            {to("label")}
          </span>
        }
        title={offer.title}
        lead={offer.subtitle}
        breadcrumbs={[
          { label: ts("home"), href: "/" },
          { label: offersTitle, href: "/offers" },
          { label: offer.title },
        ]}
        breadcrumbLabel={ts("breadcrumb")}
      >
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-mist">
          <OfferValidity offer={offer} locale={locale} />
          {soon ? (
            <span className="rounded-full bg-gold-soft-gradient px-3 py-1 text-xs font-semibold text-night rtl:text-sm">
              {t("endsSoon")}
            </span>
          ) : null}
        </div>
      </PageHero>

      <Section tone="ivory">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-14">
          <Card as="article" padding="lg" className="min-w-0">
            {offer.image_url ? (
              <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-xl border border-line">
                <MediaImage
                  src={offer.image_url}
                  alt=""
                  fill
                  loading="eager"
                  fetchPriority="high"
                  sizes="(min-width: 1152px) 680px, (min-width: 1024px) 60vw, 100vw"
                  className="object-cover"
                />
              </div>
            ) : null}
            <div
              className="prose-zb max-w-[68ch] text-[1.125rem] rtl:text-[1.2rem] rtl:leading-[2]"
              dangerouslySetInnerHTML={{ __html: offer.body_html }}
            />
            <GoldRule className="mt-10 mb-6" />
            <BackLink href="/offers">{t("allOffers")}</BackLink>
          </Card>

          <aside aria-labelledby="redeem-title">
            <Card variant="featured" padding="none" className="overflow-hidden">
              <div data-tone="night" className="relative h-28 bg-night-sky">
                <CelestialArt seed={offer.id + 100} />
              </div>
              <div className="p-6 sm:p-7">
                <h2 id="redeem-title" className="font-serif text-2xl font-semibold text-fg">
                  {t("redeemTitle")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {code ? t("redeemWithCode") : t("redeemWithoutCode")}
                </p>
                {code ? (
                  <div className="mt-5 space-y-3">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase rtl:text-sm rtl:tracking-normal">
                      {t("codeLabel")}
                    </p>
                    <CodeChip
                      code={code}
                      size="lg"
                      copyLabel={to("copyCode", { code })}
                      copiedLabel={to("codeCopied")}
                      failedLabel={ts("copyFailed")}
                    />
                  </div>
                ) : null}
                <div className="mt-6 flex flex-col gap-3">
                  {code ? (
                    <Button href={applyCodeHref(code)} fullWidth icon={<ArrowIcon />}>
                      {t("applyCode")}
                    </Button>
                  ) : null}
                  <Button
                    href={offerCtaHref(offer)}
                    variant={code ? "outline" : "primary"}
                    fullWidth
                    icon={code ? undefined : <ArrowIcon />}
                  >
                    {ctaLabel}
                  </Button>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  );
}
