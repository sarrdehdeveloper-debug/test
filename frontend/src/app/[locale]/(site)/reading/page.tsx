import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Sparkle } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { FlowHero, FlowSurface, HeroChip } from "@/components/flows/FlowHero";
import { FlowMessages } from "@/components/flows/FlowMessages";
import { OrderForm } from "@/components/flows/reading/OrderForm";
import { Card } from "@/components/ui/Card";
import { isAppLocale, LOCALE_META } from "@/i18n/routing";
import { apiGet } from "@/lib/api/server";
import { getSiteContent } from "@/lib/content";
import { toCountryOption } from "@/lib/flows/geo";
import { formatMoney } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { getPublicConfig } from "@/lib/public-config";
import type { Country, ItemsResponse } from "@/lib/types";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reading">): Promise<Metadata> {
  const { locale } = await params;
  const [c, t] = await Promise.all([getSiteContent(locale), getTranslations("reading")]);
  return pageMetadata({
    locale,
    path: "/reading",
    title: c.t("reading.intro.title"),
    description: t("metaDescription"),
  });
}

export default async function ReadingPage({ params }: PageProps<"/[locale]/reading">) {
  const { locale } = await params;
  const [c, config, t, tc, countries] = await Promise.all([
    getSiteContent(locale),
    getPublicConfig(),
    getTranslations("reading"),
    getTranslations("common"),
    // Public, non-personal and rarely changing: rendered into the page (no loading state).
    apiGet<ItemsResponse<Country>>("/geo/countries", { locale, revalidate: 3600 }),
  ]);
  const price = formatMoney(config.paid_price_cents, config.currency, locale);
  const language = isAppLocale(locale) ? LOCALE_META[locale].label : locale;
  const includes = c.lines("reading.includes");

  return (
    <>
      <FlowHero
        overlap
        headingId="reading-title"
        eyebrow={t("eyebrow")}
        title={c.t("reading.intro.title")}
        lead={c.t("reading.intro.body")}
      >
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <HeroChip className="border-gold-light/40 text-ivory">
            <span className="font-display text-lg font-semibold text-gold-light" dir="ltr">
              {price}
            </span>
            <span>{tc("oneTime")}</span>
          </HeroChip>
          <HeroChip>
            <Sparkle className="size-2.5 text-gold-light" />
            {t("deliveryNote")}
          </HeroChip>
        </div>
      </FlowHero>
      <FlowSurface size="default">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <aside aria-labelledby="includes-title" className="lg:sticky lg:top-24 lg:order-last">
            <Card
              variant="featured"
              data-tone="night"
              padding="none"
              className="isolate overflow-hidden px-6 py-7 sm:px-7"
            >
              <StarField density="low" seed={17} className="-z-10 rounded-2xl opacity-60" />
              <h2 id="includes-title" className="font-serif text-2xl font-semibold text-ivory">
                {t("includesTitle")}
              </h2>
              <ol className="mt-5 space-y-4">
                {includes.map((line, index) => {
                  const [head, ...rest] = line.split(/:\s*/);
                  const body = rest.join(": ");
                  return (
                    <li key={line} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-gold-light/40 font-display text-xs font-semibold text-gold-light"
                      >
                        {index + 1}
                      </span>
                      <span className="text-sm leading-relaxed text-mist">
                        {body ? (
                          <>
                            <span className="font-semibold text-ivory">{head}</span>
                            <span className="sr-only">: </span>
                            <span className="block first-letter:uppercase">{body}</span>
                          </>
                        ) : (
                          line
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <hr aria-hidden="true" className="rule-gold my-6" />
              <p className="text-xs leading-relaxed text-mist/90">{c.t("reading.privacy_note")}</p>
              <p className="mt-3 text-xs leading-relaxed text-mist/90">
                {t("reportLanguage", { language })}
              </p>
            </Card>
          </aside>
          <Card padding="none" className="px-5 py-8 shadow-lift sm:px-9 sm:py-10">
            <FlowMessages namespaces={["reading"]}>
              <OrderForm
                minDate={config.min_birth_date}
                listPriceCents={config.paid_price_cents}
                currency={config.currency}
                countries={countries ? countries.items.map(toCountryOption) : null}
              />
            </FlowMessages>
          </Card>
        </div>
      </FlowSurface>
    </>
  );
}
