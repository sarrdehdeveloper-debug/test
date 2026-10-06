import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArticleLanguages } from "@/components/blog/ArticleLanguages";
import { PostCard } from "@/components/blog/PostCard";
import { ShareBar } from "@/components/blog/ShareBar";
import { Ornament } from "@/components/decor/Ornament";
import { BackLink } from "@/components/pages/BackLink";
import { CtaBand } from "@/components/pages/CtaBand";
import { BLOG_PAGE_SIZE, getPost, getPosts } from "@/components/pages/data";
import { htmlSummary } from "@/components/pages/helpers/html";
import { readingMinutes } from "@/components/pages/helpers/reading-time";
import {
  absoluteUrl,
  articleJsonLd,
  isValidSlug,
  serializeJsonLd,
} from "@/components/pages/helpers/seo";
import { withHeadingAnchors } from "@/components/pages/helpers/toc";
import { PageHero } from "@/components/pages/PageHero";
import { UnavailableNotice } from "@/components/pages/StatusBlocks";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { MediaImage } from "@/components/ui/MediaImage";
import { Section } from "@/components/ui/Section";
import { isAppLocale, localeDir, routing } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { getSiteContent } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { SITE_NAME, siteUrl } from "@/lib/site";
import type { PostOut } from "@/lib/types";

export const revalidate = 120;

/** Recent posts are prerendered when the API is reachable at build time; others on demand (ISR). */
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const result = await getPosts(params.locale, 1, BLOG_PAGE_SIZE);
  return result.ok ? result.data.items.map((post) => ({ slug: post.slug })) : [];
}

/**
 * The language the article is actually written in: the page locale when translated, otherwise
 * the API's fallback (default locale, or the first language it exists in).
 */
function contentLocaleOf(post: PostOut, locale: string): string {
  const available = post.available_locales.filter(isAppLocale);
  if (available.includes(locale as (typeof available)[number])) return locale;
  if (available.includes(routing.defaultLocale)) return routing.defaultLocale;
  return available[0] ?? routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidSlug(slug)) return {};
  const result = await getPost(slug, locale);
  if (!result.ok) {
    if (result.error.isNotFound) return {};
    const ts = await getTranslations("pagesShared");
    return { title: ts("unavailableTitle"), robots: { index: false, follow: true } };
  }
  const post = result.data;
  const contentLocale = contentLocaleOf(post, locale);
  const path = `/blog/${post.slug}`;
  const meta = pageMetadata({
    locale,
    path,
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || htmlSummary(post.body_html),
    // hreflang only for the languages the post is written in.
    locales: post.available_locales,
    type: "article",
    ...(post.cover_image_url ? { images: [{ url: post.cover_image_url, alt: post.title }] } : {}),
  });
  return {
    ...meta,
    authors: post.author_name ? [{ name: post.author_name }] : undefined,
    // An untranslated page shows the original text: point search engines at the original.
    alternates: {
      ...meta.alternates,
      canonical: `/${contentLocale}${path}`,
    },
    openGraph: {
      ...meta.openGraph,
      url: `/${contentLocale}${path}`,
      type: "article",
      publishedTime: post.published_at ?? undefined,
      authors: post.author_name ? [post.author_name] : undefined,
    },
  };
}

/** Long-read typography on top of `.prose-zb` (Latin vs Arabic metrics). */
const PROSE_BASE =
  "prose-zb [&_h2]:scroll-mt-6 [&_h2]:font-semibold [&_h3]:scroll-mt-6 " +
  "[&>p:first-child]:font-serif [&>p:first-child]:text-fg " +
  "[&_blockquote]:my-10 [&_blockquote]:text-[1.35em]";
const PROSE_LTR =
  "text-[1.125rem] leading-[1.85] sm:text-[1.1875rem] " +
  "[&>p:first-child]:text-[1.45rem] [&>p:first-child]:leading-[1.55] sm:[&>p:first-child]:text-[1.6rem] " +
  "[&_h2]:mt-[2.1em] [&_h2]:text-[1.85rem] sm:[&_h2]:text-[2.1rem] [&_h3]:text-[1.45rem]";
const PROSE_RTL =
  "text-[1.2rem] leading-[2.05] sm:text-[1.25rem] " +
  "[&>p:first-child]:text-[1.4rem] [&>p:first-child]:leading-[1.9] sm:[&>p:first-child]:text-[1.5rem] " +
  "[&_h2]:mt-[1.9em] [&_h2]:text-[1.7rem] [&_h2]:leading-[1.6] sm:[&_h2]:text-[1.9rem] [&_h3]:text-[1.4rem] [&_h3]:leading-[1.6]";

export default async function ArticlePage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { locale, slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const [result, latest, c, t, tb, ts] = await Promise.all([
    getPost(slug, locale),
    getPosts(locale, 1, 4),
    getSiteContent(locale),
    getTranslations("blogPage"),
    getTranslations("blog"),
    getTranslations("pagesShared"),
  ]);
  if (!result.ok && result.error.isNotFound) notFound();

  const journal = c.t("blog.intro.title");
  if (!result.ok) {
    return (
      <>
        <PageHero
          id="article-title"
          seed={78}
          eyebrow={t("eyebrow")}
          title={journal}
          breadcrumbs={[
            { label: ts("home"), href: "/" },
            { label: journal, href: "/blog" },
          ]}
          breadcrumbLabel={ts("breadcrumb")}
        />
        <Section tone="ivory">
          <UnavailableNotice
            title={ts("unavailableTitle")}
            body={ts("unavailableBody")}
            retryHref={`/${locale}/blog/${slug}`}
            retryLabel={ts("retry")}
            actions={
              <Button href="/blog" variant="outline">
                {t("backToJournal")}
              </Button>
            }
          />
        </Section>
      </>
    );
  }

  const post = result.data;
  const contentLocale = contentLocaleOf(post, locale);
  const translated = contentLocale === locale;
  const dir = localeDir(contentLocale);
  const minutes = readingMinutes(post.body_html, contentLocale);
  const date = formatDate(post.published_at, locale, { dateStyle: "long" });
  const { html } = withHeadingAnchors(post.body_html, {
    levels: [2, 3],
    reserved: ["main", "article-title", "related-title", "page-cta"],
  });
  const url = absoluteUrl(`/${locale}/blog/${post.slug}`, siteUrl());
  const related = (latest.ok ? latest.data.items : [])
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3);
  const jsonLd = articleJsonLd({
    url: absoluteUrl(`/${contentLocale}/blog/${post.slug}`, siteUrl()),
    headline: post.title,
    description: post.seo_description || post.excerpt || htmlSummary(post.body_html),
    image: absoluteUrl(post.cover_image_url || "/brand/og-image.png", siteUrl()),
    datePublished: post.published_at,
    authorName: post.author_name,
    publisherName: SITE_NAME,
    publisherLogo: absoluteUrl("/brand/logo.png", siteUrl()),
    inLanguage: contentLocale,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <PageHero
        id="article-title"
        seed={78}
        align="start"
        containerSize="narrow"
        eyebrow={t("eyebrow")}
        title={
          translated ? (
            post.title
          ) : (
            // Untranslated post: isolate the original text (own direction and fonts).
            <span lang={contentLocale} dir={dir} className="font-serif">
              {post.title}
            </span>
          )
        }
        lead={
          translated || !post.excerpt ? (
            post.excerpt || null
          ) : (
            <span lang={contentLocale} dir={dir} className="font-sans">
              {post.excerpt}
            </span>
          )
        }
        breadcrumbs={[
          { label: ts("home"), href: "/" },
          { label: journal, href: "/blog" },
          { label: post.title },
        ]}
        breadcrumbLabel={ts("breadcrumb")}
      >
        <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-mist">
          {post.author_name ? (
            <li className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full border border-gold-light/40 bg-white/5 font-display text-sm font-semibold text-gold-light"
              >
                {post.author_name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="font-medium text-ivory">
                {t("by", { author: post.author_name })}
              </span>
            </li>
          ) : null}
          {date ? (
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="size-1 rounded-full bg-gold-light/70" />
              <time dateTime={post.published_at ?? undefined}>{date}</time>
            </li>
          ) : null}
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1 rounded-full bg-gold-light/70" />
            {t("readingTime", { minutes, count: String(minutes) })}
          </li>
        </ul>
      </PageHero>

      <article
        aria-labelledby="article-title"
        data-tone="ivory"
        className="bg-ivory pt-12 pb-16 sm:pt-16 sm:pb-24"
      >
        {post.cover_image_url ? (
          <Container size="default" className="mb-12 sm:mb-16">
            <div className="relative mx-auto aspect-[16/9] max-w-5xl overflow-hidden rounded-2xl border border-line shadow-lift">
              <MediaImage
                src={post.cover_image_url}
                alt=""
                fill
                loading="eager"
                fetchPriority="high"
                sizes="(min-width: 1024px) 1024px, 100vw"
                className="object-cover"
              />
            </div>
          </Container>
        ) : null}

        <Container size="narrow">
          {!translated ? (
            <Alert tone="info" className="mb-10">
              {t("notInLocale")}
            </Alert>
          ) : null}
          <div
            lang={contentLocale}
            dir={dir}
            className={cn(
              PROSE_BASE,
              dir === "rtl" ? PROSE_RTL : PROSE_LTR,
              // Re-resolve the font stack for the content language (Latin text on Arabic pages).
              !translated && "font-sans",
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <Ornament className="mx-auto mt-16 h-4 w-40 text-ornament" />

          <footer className="mt-12 grid gap-8 rounded-2xl border border-line bg-card p-6 shadow-card sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <ShareBar url={url} title={post.title} />
            <ArticleLanguages slug={post.slug} locale={locale} available={post.available_locales} />
          </footer>

          <BackLink href="/blog" className="mt-10">
            {t("backToJournal")}
          </BackLink>
        </Container>
      </article>

      {related.length > 0 ? (
        <Section tone="parchment" aria-labelledby="related-title">
          <Heading id="related-title" size="md" eyebrow={t("eyebrow")} title={t("related")} />
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <li key={p.slug}>
                <PostCard post={p} locale={locale} readLabel={tb("readArticle")} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <CtaBand />
    </>
  );
}
