import { getTranslations } from "next-intl/server";
import { PostCard } from "@/components/blog/PostCard";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";
import { apiGet } from "@/lib/api/server";
import type { SiteContentAccessor } from "@/lib/content";
import type { Paginated, PostSummary } from "@/lib/types";

/** Latest 3 posts; renders nothing when there are none or the API is unavailable. */
export async function BlogTeaser({ content: c, locale }: { content: SiteContentAccessor; locale: string }) {
  const data = await apiGet<Paginated<PostSummary>>("/blog", {
    locale,
    query: { page: 1, page_size: 3 },
    revalidate: 120,
    tags: ["blog"],
  });
  const posts = data?.items?.slice(0, 3) ?? [];
  if (posts.length === 0) return null;

  const t = await getTranslations("home.blog");
  const tb = await getTranslations("blog");
  return (
    <Section tone="ivory" aria-labelledby="blog-title">
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-end lg:justify-between">
        <Heading
          id="blog-title"
          align="responsive"
          eyebrow={t("eyebrow")}
          title={c.t("home.blog.title")}
          lead={c.t("home.blog.body")}
        />
        <Button href="/blog" variant="ghost" icon={<ArrowIcon />} className="shrink-0">
          {t("cta")}
        </Button>
      </div>
      <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} locale={locale} readLabel={tb("readArticle")} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
