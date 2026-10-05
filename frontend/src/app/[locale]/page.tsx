import type { Metadata } from "next";
import { OfferBanner } from "@/components/OfferBanner";
import { BlogTeaser } from "@/components/home/BlogTeaser";
import { ClosingCta } from "@/components/home/ClosingCta";
import { Faq } from "@/components/home/Faq";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { LibraryTeaser } from "@/components/home/LibraryTeaser";
import { Plans } from "@/components/home/Plans";
import { Traditions } from "@/components/home/Traditions";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { getPublicConfig } from "@/lib/public-config";

// Static per locale, refreshed in the background at most every minute (ISR).
export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const c = await getSiteContent(locale);
  return pageMetadata({
    locale,
    path: "/",
    title: { absolute: c.t("seo.home.title") },
    description: c.t("seo.home.description"),
  });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const [content, config] = await Promise.all([getSiteContent(locale), getPublicConfig()]);

  return (
    <>
      <Hero content={content} />
      <Traditions content={content} />
      <HowItWorks content={content} />
      <Plans content={content} config={config} locale={locale} />
      <OfferBanner variant="feature" />
      <LibraryTeaser content={content} />
      <BlogTeaser content={content} locale={locale} />
      <Faq content={content} />
      <ClosingCta content={content} />
    </>
  );
}
