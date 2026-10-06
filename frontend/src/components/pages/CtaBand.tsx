import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";

/** Closing call to action of the content pages: free reading + full report. */
export async function CtaBand({ id = "page-cta" }: { id?: string }) {
  const [t, tc] = await Promise.all([getTranslations("pagesShared"), getTranslations("common")]);
  return (
    <Section tone="night" stars spacing="md" aria-labelledby={id} className="text-center">
      <Image
        src="/brand/emblem-128.png"
        alt=""
        width={128}
        height={128}
        loading="eager"
        className="mx-auto mb-7 size-16 drop-shadow-[0_0_24px_rgb(199_137_51/0.45)]"
      />
      <Heading
        id={id}
        size="md"
        eyebrow={t("ctaEyebrow")}
        title={t("ctaTitle")}
        lead={t("ctaBody")}
      />
      <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Button href="/free" size="lg" icon={<ArrowIcon />}>
          {tc("getFreeReading")}
        </Button>
        <Button href="/reading" variant="outline" size="lg">
          {tc("getFullReport")}
        </Button>
      </div>
    </Section>
  );
}
