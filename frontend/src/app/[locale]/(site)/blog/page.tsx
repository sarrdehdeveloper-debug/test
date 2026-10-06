import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FeaturedPost } from "@/components/blog/FeaturedPost";
import { PostCard } from "@/components/blog/PostCard";
import { CtaBand } from "@/components/pages/CtaBand";
import { BLOG_PAGE_SIZE, getPosts } from "@/components/pages/data";
import { pageCount, parsePageParam } from "@/components/pages/helpers/pagination";
import { PageHero } from "@/components/pages/PageHero";
import { Pagination } from "@/components/pages/Pagination";
import { EmptyState, UnavailableNotice } from "@/components/pages/StatusBlocks";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

// `?page=` makes this page render per request; the API reads stay in the data cache (tag "blog").

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const page = parsePageParam(query.page);
  const [c, t, result] = await Promise.all([
    getSiteContent(locale),
    getTranslations("blogPage"),
    // Same (deduplicated) read as the page: lets an out-of-range page keep a plain title.
    getPosts(locale, page ?? 1),
  ]);
  const title = c.t("blog.intro.title");
  if (page === null) return { title };
  if (result.ok && page > pageCount(result.data.total, BLOG_PAGE_SIZE)) return { title };
  return pageMetadata({
    locale,
    path: page > 1 ? `/blog?page=${page}` : "/blog",
    title: page > 1 ? t("metaTitlePage", { title, page: String(page) }) : title,
    description: c.t("blog.intro.body"),
  });
}

export default async function BlogPage({ params, searchParams }: PageProps<"/[locale]/blog">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const page = parsePageParam(query.page);
  if (page === null) notFound();

  const [c, result, t, tb, ts, tc] = await Promise.all([
    getSiteContent(locale),
    getPosts(locale, page),
    getTranslations("blogPage"),
    getTranslations("blog"),
    getTranslations("pagesShared"),
    getTranslations("common"),
  ]);

  const total = result.ok ? result.data.total : 0;
  const count = pageCount(total, BLOG_PAGE_SIZE);
  // Out-of-range pages (e.g. after posts were unpublished) are not found; page 1 always exists.
  if (result.ok && page > count) notFound();

  const posts = result.ok ? result.data.items : [];
  // The newest post is featured on page 1; later pages are a plain grid.
  const featured = page === 1 ? posts[0] : undefined;
  const gridPosts = featured ? posts.slice(1) : posts;
  const title = c.t("blog.intro.title");

  return (
    <>
      <PageHero
        id="blog-title"
        seed={77}
        eyebrow={t("eyebrow")}
        title={title}
        lead={c.t("blog.intro.body")}
        breadcrumbs={[{ label: ts("home"), href: "/" }, { label: title }]}
        breadcrumbLabel={ts("breadcrumb")}
      />

      <Section tone="ivory" aria-label={t("allArticles")}>
        {!result.ok ? (
          <UnavailableNotice
            title={ts("unavailableTitle")}
            body={ts("unavailableBody")}
            retryHref={`/${locale}/blog${page > 1 ? `?page=${page}` : ""}`}
            retryLabel={ts("retry")}
          />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="crescent"
            title={t("emptyTitle")}
            body={t("emptyBody")}
            actions={
              <Button href="/free" icon={<ArrowIcon />}>
                {tc("getFreeReading")}
              </Button>
            }
          />
        ) : (
          <>
            {featured ? (
              <FeaturedPost
                post={featured}
                locale={locale}
                label={t("featured")}
                readLabel={tb("readArticle")}
                byline={
                  featured.author_name ? t("by", { author: featured.author_name }) : undefined
                }
              />
            ) : null}

            {gridPosts.length > 0 ? (
              <div className={featured ? "mt-16 sm:mt-20" : undefined}>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
                  <h2 className="font-serif text-3xl font-semibold text-fg">
                    {featured ? t("moreArticles") : t("allArticles")}
                  </h2>
                  {count > 1 ? (
                    // Phones show "Page X of Y" in the pagination bar instead.
                    <p className="text-sm font-medium text-muted max-sm:hidden">
                      {t("pageOf", { page: String(page), total: String(count) })}
                    </p>
                  ) : null}
                </div>
                <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {gridPosts.map((post) => (
                    <li key={post.slug}>
                      <PostCard post={post} locale={locale} readLabel={tb("readArticle")} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Pagination basePath="/blog" page={page} count={count} className="mt-14" />
          </>
        )}
      </Section>

      <CtaBand />
    </>
  );
}
