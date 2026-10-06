import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BackLink } from "@/components/pages/BackLink";
import { CtaBand } from "@/components/pages/CtaBand";
import { getLibrary, getSeries } from "@/components/pages/data";
import { htmlSummary } from "@/components/pages/helpers/html";
import { isValidSlug } from "@/components/pages/helpers/seo";
import { BookCard } from "@/components/pages/library/BookCard";
import { BookCover } from "@/components/pages/library/BookCover";
import { PageHero } from "@/components/pages/PageHero";
import { UnavailableNotice } from "@/components/pages/StatusBlocks";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 300;

/** Published series are prerendered when the API is reachable at build time; others on demand. */
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const result = await getLibrary(params.locale);
  return result.ok ? result.data.items.map((series) => ({ slug: series.slug })) : [];
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/library/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidSlug(slug)) return {};
  const result = await getSeries(slug, locale);
  if (!result.ok) {
    if (result.error.isNotFound) return {};
    const ts = await getTranslations("pagesShared");
    return { title: ts("unavailableTitle"), robots: { index: false, follow: true } };
  }
  const series = result.data;
  return pageMetadata({
    locale,
    path: `/library/${series.slug}`,
    title: series.title,
    description: htmlSummary(series.description_html),
    ...(series.cover_image_url
      ? { images: [{ url: series.cover_image_url, alt: series.title }] }
      : {}),
  });
}

export default async function SeriesPage({ params }: PageProps<"/[locale]/library/[slug]">) {
  const { locale, slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const [result, c, t, ts] = await Promise.all([
    getSeries(slug, locale),
    getSiteContent(locale),
    getTranslations("libraryPage"),
    getTranslations("pagesShared"),
  ]);
  if (!result.ok && result.error.isNotFound) notFound();

  const library = c.t("library.intro.title");
  const crumbs = [
    { label: ts("home"), href: "/" },
    { label: library, href: "/library" },
  ];

  if (!result.ok) {
    return (
      <>
        <PageHero
          id="series-title"
          seed={62}
          eyebrow={t("eyebrow")}
          title={library}
          breadcrumbs={crumbs}
          breadcrumbLabel={ts("breadcrumb")}
        />
        <Section tone="ivory">
          <UnavailableNotice
            title={ts("unavailableTitle")}
            body={ts("unavailableBody")}
            retryHref={`/${locale}/library/${slug}`}
            retryLabel={ts("retry")}
            actions={
              <Button href="/library" variant="outline">
                {t("allSeries")}
              </Button>
            }
          />
        </Section>
      </>
    );
  }

  const series = result.data;
  const count = series.books.length;

  return (
    <>
      <PageHero
        id="series-title"
        seed={62}
        eyebrow={t("eyebrow")}
        title={series.title}
        breadcrumbs={[...crumbs, { label: series.title }]}
        breadcrumbLabel={ts("breadcrumb")}
        aside={
          <BookCover
            src={series.cover_image_url}
            title={series.title}
            imprint={library}
            eager
            sizes="(min-width: 1024px) 256px, 176px"
            className="mx-auto w-44 lg:w-64"
          />
        }
      >
        {series.description_html ? (
          <div
            className="prose-zb mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-mist [&_strong]:text-ivory lg:mx-0"
            dangerouslySetInnerHTML={{ __html: series.description_html }}
          />
        ) : null}
        {count > 0 ? (
          <p className="mt-6 text-sm font-medium text-gold-light">
            {t("bookCount", { count, n: String(count) })}
          </p>
        ) : null}
      </PageHero>

      <Section tone="ivory" aria-labelledby="books-title">
        <h2
          id="books-title"
          className="text-center font-serif text-3xl font-semibold text-fg sm:text-4xl lg:text-start"
        >
          {t("booksTitle")}
        </h2>
        {count > 0 ? (
          <ol className="mt-10 space-y-8">
            {series.books.map((book) => (
              <li key={book.slug}>
                <BookCard book={book} imprint={series.title} layout="row" />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-6 text-center text-lg text-muted lg:text-start">{t("noBooks")}</p>
        )}
        <BackLink href="/library" className="mt-12">
          {t("allSeries")}
        </BackLink>
      </Section>

      <CtaBand />
    </>
  );
}
