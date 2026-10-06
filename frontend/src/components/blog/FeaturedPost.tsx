import { CelestialArt } from "@/components/pages/CelestialArt";
import { ArrowIcon } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MediaImage } from "@/components/ui/MediaImage";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { PostSummary } from "@/lib/types";

export interface FeaturedPostProps {
  post: PostSummary;
  locale: string;
  /** Eyebrow, e.g. t("blogPage.featured"). */
  label: string;
  /** Visible call to action, e.g. t("blog.readArticle"). */
  readLabel: string;
  /** e.g. t("blog.by", { author }). */
  byline?: string;
}

/** Large teaser of the newest post at the top of /blog (whole card clickable). */
export function FeaturedPost({ post, locale, label, readLabel, byline }: FeaturedPostProps) {
  const date = formatDate(post.published_at, locale, { dateStyle: "long" });
  return (
    <Card
      as="article"
      padding="none"
      interactive
      className="group grid overflow-hidden lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
    >
      <div
        data-tone="night"
        className="relative aspect-[16/9] overflow-hidden bg-night-sky lg:aspect-auto lg:min-h-[25rem]"
      >
        {post.cover_image_url ? (
          <MediaImage
            src={post.cover_image_url}
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1152px) 640px, (min-width: 1024px) 58vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <CelestialArt seed={17} />
        )}
      </div>
      <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
        <p className="eyebrow">{label}</p>
        {date ? (
          <p className="mt-4 text-sm font-medium text-muted">
            <time dateTime={post.published_at ?? undefined}>{date}</time>
          </p>
        ) : null}
        <h2 className="mt-2 font-serif text-[2rem] leading-[1.15] font-semibold text-fg sm:text-[2.5rem] rtl:leading-[1.45]">
          <Link
            href={`/blog/${post.slug}`}
            className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none group-focus-within:underline"
          >
            {post.title}
          </Link>
        </h2>
        {post.excerpt ? (
          <p className="mt-4 line-clamp-4 text-lg leading-relaxed text-muted">{post.excerpt}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          {byline ? <p className="text-sm text-muted">{byline}</p> : <span />}
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-2 font-semibold text-accent group-hover:underline group-hover:underline-offset-4"
          >
            {readLabel}
            <ArrowIcon />
          </span>
        </div>
      </div>
    </Card>
  );
}
