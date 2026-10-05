import { getTranslations } from "next-intl/server";
import { GoldRule, Ornament } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { ZodiacWheel } from "@/components/decor/ZodiacWheel";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import type { SiteContentAccessor } from "@/lib/content";

export async function Hero({ content: c }: { content: SiteContentAccessor }) {
  const tMeta = await getTranslations("meta");
  return (
    <section
      data-tone="night"
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-night-sky"
    >
      <StarField density="high" className="-z-10" />
      <Container
        size="wide"
        className="grid items-center gap-8 pt-8 pb-16 sm:pt-12 sm:pb-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:py-24"
      >
        <div className="animate-fade-up text-center lg:text-start">
          <p className="eyebrow">{c.t("home.hero.eyebrow")}</p>
          <h1
            id="hero-title"
            className="mt-4 font-serif text-[2.55rem] leading-[1.05] font-semibold text-ivory sm:text-6xl lg:text-[4.25rem] rtl:leading-[1.3]"
          >
            {c.t("home.hero.title")}
          </h1>
          <Ornament className="mx-auto mt-6 h-4 w-44 text-gold-bright lg:mx-0" />
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-mist sm:text-xl lg:mx-0">
            {c.t("home.hero.subtitle")}
          </p>
          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
            <Button href="/free" size="lg" icon={<ArrowIcon />}>
              {c.t("home.hero.cta_free")}
            </Button>
            <Button href="/reading" variant="outline" size="lg">
              {c.t("home.hero.cta_paid")}
            </Button>
          </div>
          <p className="mt-8 font-serif text-lg text-gold-light/90 italic rtl:not-italic">
            {tMeta("slogan")}
          </p>
        </div>
        <ZodiacWheel className="order-first mx-auto w-full max-w-[min(72vw,19rem)] sm:max-w-[24rem] lg:order-last lg:max-w-[33rem]" />
      </Container>
      <GoldRule className="absolute inset-x-0 bottom-0" />
    </section>
  );
}
