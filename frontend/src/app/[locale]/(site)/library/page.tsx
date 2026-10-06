import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LibraryArt } from "@/components/decor/LibraryArt";
import { GoldRule } from "@/components/decor/Ornament";
import { CtaBand } from "@/components/pages/CtaBand";
import { getLibrary } from "@/components/pages/data";
import { SeriesShowcase } from "@/components/pages/library/SeriesShowcase";
import { PageHero } from "@/components/pages/PageHero";
import { EmptyState, UnavailableNotice } from "@/components/pages/StatusBlocks";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/library">): Promise<Metadata> {
  const { locale } = await params;
  const c = await getSiteContent(locale);
  return pageMetadata({
    locale,
    path: "/library",
    title: c.t("library.intro.title"),
    description: c.t("library.intro.body"),
  });
}

export default async function LibraryPage({ params }: PageProps<"/[locale]/library">) {
  const { locale } = await params;
  const [c, result, t, ts, tc] = await Promise.all([
    getSiteContent(locale),
    getLibrary(locale),
    getTranslations("libraryPage"),
    getTranslations("pagesShared"),
    getTranslations("common"),
  ]);
  const series = result.ok ? result.data.items : [];
  const title = c.t("library.intro.title");

  return (
    <>
      <PageHero
        id="library-title"
        seed={61}
        eyebrow={t("eyebrow")}
        title={title}
        lead={c.t("library.intro.body")}
        breadcrumbs={[{ label: ts("home"), href: "/" }, { label: title }]}
        breadcrumbLabel={ts("breadcrumb")}
        aside={<LibraryArt className="mx-auto max-w-xs sm:max-w-sm lg:max-w-md" />}
      />

      <Section tone="ivory" aria-label={t("eyebrow")}>
        {!result.ok ? (
          <UnavailableNotice
            title={ts("unavailableTitle")}
            body={ts("unavailableBody")}
            retryHref={`/${locale}/library`}
            retryLabel={ts("retry")}
          />
        ) : series.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            body={t("emptyBody")}
            actions={
              <Button href="/free" icon={<ArrowIcon />}>
                {tc("getFreeReading")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-20 sm:space-y-24">
            {series.map((item, index) => (
              <div key={item.slug}>
                {index > 0 ? <GoldRule className="mb-20 sm:mb-24" /> : null}
                <SeriesShowcase series={item} imprint={title} eager={index === 0} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <CtaBand />
    </>
  );
}
