import { getTranslations } from "next-intl/server";
import { LibraryArt } from "@/components/decor/LibraryArt";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";
import type { SiteContentAccessor } from "@/lib/content";

export async function LibraryTeaser({ content: c }: { content: SiteContentAccessor }) {
  const t = await getTranslations("home.library");
  return (
    <Section tone="night" stars aria-labelledby="library-title">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="text-center lg:text-start">
          <Heading
            id="library-title"
            align="responsive"
            eyebrow={t("eyebrow")}
            title={c.t("home.library.title")}
            lead={c.t("home.library.body")}
          />
          <Button href="/library" variant="outline" className="mt-9" icon={<ArrowIcon />}>
            {t("cta")}
          </Button>
        </div>
        <LibraryArt className="mx-auto max-w-md lg:max-w-none" />
      </div>
    </Section>
  );
}
