import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";
import type { SiteContentAccessor } from "@/lib/content";

export async function ClosingCta({ content: c }: { content: SiteContentAccessor }) {
  const t = await getTranslations("home.cta");
  return (
    <Section tone="night" stars spacing="lg" aria-labelledby="cta-title" className="text-center">
      <Image
        src="/brand/emblem-128.png"
        alt=""
        width={128}
        height={128}
        className="mx-auto mb-8 size-20 drop-shadow-[0_0_24px_rgb(199_137_51/0.45)]"
      />
      <Heading
        id="cta-title"
        eyebrow={t("eyebrow")}
        title={c.t("home.cta.title")}
        lead={c.t("home.cta.body")}
      />
      <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Button href="/free" size="lg" icon={<ArrowIcon />}>
          {c.t("home.hero.cta_free")}
        </Button>
        <Button href="/reading" variant="outline" size="lg">
          {c.t("home.hero.cta_paid")}
        </Button>
      </div>
    </Section>
  );
}
