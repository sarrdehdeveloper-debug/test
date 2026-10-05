import { getTranslations } from "next-intl/server";
import { Sparkle } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";
import type { SiteContentAccessor } from "@/lib/content";
import { formatMoney } from "@/lib/format";
import type { PublicConfig } from "@/lib/types";

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-7 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <Sparkle className="mt-1.5 size-3 shrink-0 text-ornament" />
          <span className="text-fg/90">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export async function Plans({
  content: c,
  config,
  locale,
}: {
  content: SiteContentAccessor;
  config: Pick<PublicConfig, "paid_price_cents" | "currency">;
  locale: string;
}) {
  const t = await getTranslations("home.plans");
  const tc = await getTranslations("common");
  const price = formatMoney(config.paid_price_cents, config.currency, locale);

  return (
    <Section tone="ivory" aria-labelledby="plans-title">
      <Heading id="plans-title" eyebrow={t("eyebrow")} title={c.t("home.plans.title")} />
      <div className="mx-auto mt-14 grid max-w-5xl items-stretch gap-8 md:grid-cols-2">
        <Card padding="lg" className="flex flex-col">
          <h3 className="font-serif text-3xl font-semibold text-fg">{c.t("home.plans.free.title")}</h3>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-4xl font-semibold text-gold-deep">{tc("free")}</span>
          </p>
          <p className="mt-4 leading-relaxed text-muted">{c.t("home.plans.free.body")}</p>
          <FeatureList items={c.lines("home.plans.free.features")} />
          <div className="mt-auto pt-9">
            <Button href="/free" variant="outline" fullWidth>
              {t("ctaFree")}
            </Button>
          </div>
        </Card>

        <Card
          variant="featured"
          padding="lg"
          data-tone="night"
          className="isolate flex flex-col overflow-hidden"
        >
          <StarField density="low" seed={12} className="-z-10 rounded-2xl opacity-70" />
          <span className="absolute inset-x-0 top-0 mx-auto w-fit rounded-b-xl bg-gold-soft-gradient px-4 py-1.5 font-display text-[0.7rem] font-bold tracking-[0.18em] text-night uppercase rtl:text-sm rtl:tracking-normal">
            {t("badge")}
          </span>
          <h3 className="mt-4 font-serif text-3xl font-semibold text-ivory">{c.t("home.plans.paid.title")}</h3>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-4xl font-semibold text-gold-gradient" dir="ltr">
              {price}
            </span>
            <span className="text-sm text-mist">{tc("oneTime")}</span>
          </p>
          <p className="mt-4 leading-relaxed text-mist">{c.t("home.plans.paid.body")}</p>
          <FeatureList items={c.lines("home.plans.paid.features")} />
          <div className="mt-auto pt-9">
            <Button href="/reading" fullWidth icon={<ArrowIcon />}>
              {t("ctaPaid")}
            </Button>
          </div>
        </Card>
      </div>
    </Section>
  );
}
