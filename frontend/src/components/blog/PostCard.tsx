import { Sparkle } from "@/components/decor/Ornament";
import { Card } from "@/components/ui/Card";
import { MediaImage } from "@/components/ui/MediaImage";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { PostSummary } from "@/lib/types";

export interface PostCardProps {
  post: PostSummary;
  locale: string;
  /** Visually hidden suffix for the link, e.g. t("blog.readArticle"). */
  readLabel?: string;
  headingLevel?: "h2" | "h3";
}

/** Blog post teaser card (cover, date, title, excerpt); the whole card is clickable. */
export function PostCard({ post, locale, readLabel, headingLevel: H = "h3" }: PostCardProps) {
  const date = formatDate(post.published_at, locale, { dateStyle: "medium" });
  return (
    <Card
      as="article"
      padding="none"
      interactive
      className="group flex h-full flex-col overflow-hidden"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-night-sky">
        {post.cover_image_url ? (
          <MediaImage
            src={post.cover_image_url}
            alt=""
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Sparkle className="size-8 text-gold-light/80" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        {date ? (
          <p className="text-xs font-semibold tracking-wide text-accent uppercase rtl:text-sm rtl:tracking-normal">
            <time dateTime={post.published_at ?? undefined}>{date}</time>
          </p>
        ) : null}
        <H className="mt-2 font-serif text-2xl leading-snug font-semibold text-fg">
          <Link
            href={`/blog/${post.slug}`}
            className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none group-focus-within:underline"
          >
            {post.title}
            {readLabel ? <span className="sr-only"> — {readLabel}</span> : null}
          </Link>
        </H>
        {post.excerpt ? (
          <p className="mt-3 line-clamp-3 leading-relaxed text-muted">{post.excerpt}</p>
        ) : null}
        {post.author_name ? (
          <p className="mt-auto pt-5 text-sm text-muted">{post.author_name}</p>
        ) : null}
      </div>
    </Card>
  );
}
