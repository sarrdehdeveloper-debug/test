import { getTranslations } from "next-intl/server";
import { Sparkle } from "@/components/decor/Ornament";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MediaImage } from "@/components/ui/MediaImage";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { toSiteHref } from "@/lib/links";
import type { OfferOut } from "@/lib/types";
import { CodeChip } from "../CodeChip";
import { endsSoon, formatDateRange, isoDay, offerWindow } from "../helpers/dates";
import { CelestialArt } from "../CelestialArt";

/** Href of an offer's main button: its CMS link (locale stripped) or the paid reading form. */
export function offerCtaHref(offer: OfferOut): string {
  return toSiteHref(offer.cta_url ?? "/reading", "/reading");
}

/** "/reading?code=WELCOME10": the reading form pre-fills the code. */
export function applyCodeHref(code: string): string {
  return `/reading?code=${encodeURIComponent(code)}`;
}

/** Localised validity sentence of an offer ("Valid until October 31, 2026"). */
export async function OfferValidity({
  offer,
  locale,
  showOpen = false,
  className,
}: {
  offer: Pick<OfferOut, "starts_at" | "ends_at">;
  locale: string;
  /** Also render "No end date" for offers without dates (default: render nothing). */
  showOpen?: boolean;
  className?: string;
}) {
  const t = await getTranslations("offersPage.validity");
  const validity = offerWindow(offer.starts_at, offer.ends_at);
  if (validity.kind === "open" && !showOpen) return null;
  const long = { dateStyle: "long" } as const;
  let text: string;
  let dateTime: string | undefined;
  switch (validity.kind) {
    case "between":
      text = t("between", { range: formatDateRange(validity.start, validity.end, locale, long) });
      dateTime = isoDay(validity.end);
      break;
    case "until":
      text = t("until", { date: formatDate(validity.end, locale, long) });
      dateTime = isoDay(validity.end);
      break;
    case "from":
      text = t("from", { date: formatDate(validity.start, locale, long) });
      dateTime = isoDay(validity.start);
      break;
    default:
      text = t("open");
  }
  return (
    <p className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="size-4 shrink-0 text-ornament"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
        <path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" />
      </svg>
      {dateTime ? <time dateTime={dateTime}>{text}</time> : <span>{text}</span>}
    </p>
  );
}

/** Wide offer card of the /offers list: artwork, validity, title, code ticket and actions. */
export async function OfferCard({
  offer,
  locale,
  now,
  eager = false,
  headingLevel: H = "h2",
}: {
  offer: OfferOut;
  locale: string;
  now: Date;
  /** First card: load its image eagerly (largest contentful paint). */
  eager?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const [t, to, ts, tc] = await Promise.all([
    getTranslations("offersPage"),
    getTranslations("offers"),
    getTranslations("pagesShared"),
    getTranslations("common"),
  ]);
  const soon = endsSoon(offer.ends_at, now);
  const titleId = `offer-${offer.id}-title`;

  return (
    <Card
      as="article"
      padding="none"
      aria-labelledby={titleId}
      className="grid overflow-hidden md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <div
        data-tone="night"
        className="relative aspect-[16/10] bg-night-sky md:aspect-auto md:min-h-80"
      >
        {offer.image_url ? (
          <MediaImage
            src={offer.image_url}
            alt=""
            fill
            sizes="(min-width: 1152px) 470px, (min-width: 768px) 40vw, 100vw"
            {...(eager ? { loading: "eager", fetchPriority: "high" } : {})}
            className="object-cover"
          />
        ) : (
          <CelestialArt seed={offer.id} />
        )}
        {soon ? (
          <span className="absolute start-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-gold-soft-gradient px-3 py-1 text-xs font-semibold text-night shadow-card rtl:text-sm">
            <Sparkle className="size-3" />
            {t("endsSoon")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col p-6 sm:p-8 lg:p-10">
        <p className="eyebrow inline-flex items-center gap-2">
          <Sparkle className="size-3" />
          {to("label")}
        </p>
        <H
          id={titleId}
          className="mt-3 font-serif text-[1.9rem] leading-tight font-semibold text-fg sm:text-[2.2rem]"
        >
          {offer.title}
        </H>
        {offer.subtitle ? (
          <p className="mt-3 text-lg leading-relaxed text-muted">{offer.subtitle}</p>
        ) : null}
        <OfferValidity
          offer={offer}
          locale={locale}
          className="mt-4 text-sm font-medium text-muted"
        />

        {offer.discount_code ? (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-parchment/60 px-4 py-3.5">
            <span className="text-sm font-medium text-muted">{t("codeLabel")}</span>
            <CodeChip
              code={offer.discount_code}
              copyLabel={to("copyCode", { code: offer.discount_code })}
              copiedLabel={to("codeCopied")}
              failedLabel={ts("copyFailed")}
            />
            <Link
              href={applyCodeHref(offer.discount_code)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline decoration-gold/40 underline-offset-4 transition-colors hover:decoration-current"
            >
              {t("applyCode")}
              <ArrowIcon className="size-3.5" />
            </Link>
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:items-center">
          <Button href={offerCtaHref(offer)} icon={<ArrowIcon />}>
            {offer.cta_label || (offer.cta_url ? to("cta") : tc("getFullReport"))}
          </Button>
          <Button
            href={`/offers/${offer.slug}`}
            variant="ghost"
            aria-label={t("detailsFor", { title: offer.title })}
          >
            {t("details")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
