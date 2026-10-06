import { getLocale, getTranslations } from "next-intl/server";
import { Sparkle } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { MediaImage } from "@/components/ui/MediaImage";
import { Link } from "@/i18n/navigation";
import { apiGet } from "@/lib/api/server";
import { CACHE_TAGS } from "@/lib/api/tags";
import { formatDate, isExternalUrl } from "@/lib/format";
import { toSiteHref } from "@/lib/links";
import type { ItemsResponse, OfferOut } from "@/lib/types";
import { CopyCode, DismissibleOffer } from "./OfferBannerClient";

export interface OfferBannerProps {
  /**
   * "bar": slim announcement strip (e.g. above the page content);
   * "feature": a large card band (home page).
   */
  variant?: "bar" | "feature";
}

function offerHref(offer: OfferOut): string {
  if (offer.cta_url) return toSiteHref(offer.cta_url);
  return offer.discount_code
    ? `/reading?code=${encodeURIComponent(offer.discount_code)}`
    : "/reading";
}

/**
 * Current banner offer from GET /api/v1/offers?banner=true (first by sort order).
 * Renders nothing when there is no offer or the API is unavailable; visitors can dismiss it.
 */
export async function OfferBanner({ variant = "bar" }: OfferBannerProps) {
  const locale = await getLocale();
  const data = await apiGet<ItemsResponse<OfferOut>>("/offers", {
    locale,
    query: { banner: true },
    revalidate: 60,
    tags: [CACHE_TAGS.offers],
  });
  const offer = data?.items?.find((item) => item.show_banner) ?? data?.items?.[0];
  if (!offer) return null;

  const t = await getTranslations("offers");
  const href = offerHref(offer);
  const external = isExternalUrl(href);
  const ctaLabel = offer.cta_label || t("cta");
  const endsOn = offer.ends_at
    ? t("endsOn", { date: formatDate(offer.ends_at, locale, { dateStyle: "medium" }) })
    : null;
  const code = offer.discount_code ? (
    <CopyCode
      code={offer.discount_code}
      copyLabel={t("copyCode", { code: offer.discount_code })}
      copiedLabel={t("codeCopied")}
    />
  ) : null;

  if (variant === "bar") {
    const barLinkClass =
      "inline-flex items-center gap-1 font-semibold text-gold-light underline-offset-4 hover:underline";
    return (
      <DismissibleOffer
        offerId={offer.id}
        dismissLabel={t("dismiss")}
        buttonClassName="top-1/2 -translate-y-1/2 end-1 sm:end-3"
      >
        <aside
          data-tone="night"
          aria-label={t("label")}
          className="border-b border-gold-light/20 bg-night-2 text-ivory"
        >
          <Container
            size="wide"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-2.5 pe-12 text-center text-sm sm:pe-14"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkle className="size-3.5 text-gold-light" />
              <span className="eyebrow">{t("label")}</span>
            </span>
            <span className="font-medium">{offer.title}</span>
            {code}
            {external ? (
              <a href={href} className={barLinkClass}>
                {ctaLabel}
                <ArrowIcon className="size-3.5" />
              </a>
            ) : (
              <Link href={href} className={barLinkClass}>
                {ctaLabel}
                <ArrowIcon className="size-3.5" />
              </Link>
            )}
          </Container>
        </aside>
      </DismissibleOffer>
    );
  }

  return (
    <section aria-label={t("label")} data-tone="ivory" className="bg-ivory pb-4 sm:pb-8">
      <Container>
        <DismissibleOffer
          offerId={offer.id}
          dismissLabel={t("dismiss")}
          buttonClassName="top-3 end-3"
        >
          <div
            data-tone="night"
            className="relative isolate overflow-hidden rounded-3xl border border-gold-light/30 bg-night-sky shadow-glow"
          >
            <StarField density="low" seed={33} className="-z-10" />
            <div className="grid items-center gap-8 p-7 sm:p-10 md:grid-cols-[minmax(0,1fr)_auto] lg:p-12">
              <div className="text-center md:text-start">
                <p className="eyebrow inline-flex items-center gap-2">
                  <Sparkle className="size-3.5" />
                  {t("label")}
                </p>
                <h2 className="mt-3 font-serif text-3xl leading-tight font-semibold text-ivory sm:text-4xl">
                  {offer.title}
                </h2>
                {offer.subtitle ? (
                  <p className="mt-3 max-w-2xl text-lg text-mist md:max-w-none">{offer.subtitle}</p>
                ) : null}
                <div className="mt-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-center md:justify-start">
                  <Button href={href} icon={<ArrowIcon />}>
                    {ctaLabel}
                  </Button>
                  {code ? (
                    <span className="inline-flex items-center gap-2 text-sm text-mist">
                      {t("useCode")} {code}
                    </span>
                  ) : null}
                </div>
                {endsOn ? <p className="mt-5 text-sm text-mist/80">{endsOn}</p> : null}
              </div>
              {offer.image_url ? (
                <div className="relative mx-auto aspect-square w-48 overflow-hidden rounded-2xl border border-gold-light/30 sm:w-56">
                  <MediaImage
                    src={offer.image_url}
                    alt=""
                    fill
                    sizes="224px"
                    className="object-cover"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </DismissibleOffer>
      </Container>
    </section>
  );
}
