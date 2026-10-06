import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Sparkle } from "@/components/decor/Ornament";
import { FlowHero, FlowSurface, HeroChip } from "@/components/flows/FlowHero";
import { FlowMessages } from "@/components/flows/FlowMessages";
import { FreeReadingFlow } from "@/components/flows/free/FreeReadingFlow";
import { isAppLocale, LOCALE_META } from "@/i18n/routing";
import { getSiteContent } from "@/lib/content";
import { formatMoney } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { getPublicConfig } from "@/lib/public-config";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/free">): Promise<Metadata> {
  const { locale } = await params;
  const [c, t] = await Promise.all([getSiteContent(locale), getTranslations("free")]);
  return pageMetadata({
    locale,
    path: "/free",
    title: c.t("free.intro.title"),
    description: t("metaDescription"),
  });
}

export default async function FreeReadingPage({ params }: PageProps<"/[locale]/free">) {
  const { locale } = await params;
  const [c, config, t] = await Promise.all([
    getSiteContent(locale),
    getPublicConfig(),
    getTranslations("free"),
  ]);
  const locales = config.locales.map((code) => ({
    code,
    label: isAppLocale(code) ? LOCALE_META[code].label : code.toUpperCase(),
  }));

  return (
    <>
      <FlowHero
        overlap
        headingId="free-title"
        eyebrow={t("eyebrow")}
        title={c.t("free.intro.title")}
        lead={c.t("free.intro.body")}
      >
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {(["instant", "noAccount", "traditions"] as const).map((key) => (
            <li key={key}>
              <HeroChip>
                <Sparkle className="size-2.5 text-gold-light" />
                {t(`highlights.${key}`)}
              </HeroChip>
            </li>
          ))}
        </ul>
      </FlowHero>
      <FlowSurface size="default">
        <FlowMessages namespaces={["free"]}>
          <FreeReadingFlow
            locales={locales}
            minDate={config.min_birth_date}
            priceLabel={formatMoney(config.paid_price_cents, config.currency, locale)}
          />
        </FlowMessages>
      </FlowSurface>
    </>
  );
}
