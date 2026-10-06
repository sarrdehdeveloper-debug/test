/**
 * Blog post editor model: API row ⇄ form values ⇄ create/PATCH bodies, validation, the displayed
 * status (draft / published / scheduled) and the publishing action that applies.
 */
import type {
  Locale,
  PostAdmin,
  PostAdminSummary,
  PostCreate,
  PostTranslation,
  PostUpdate,
  Translations,
} from "@/lib/admin/types";
import {
  cleanTranslations,
  diffFields,
  emptyToNull,
  fillTranslations,
  LIMITS,
  validateSlug,
  validateTranslations,
} from "../content/forms";

export const POST_FIELDS = ["title", "excerpt", "body", "seo_title", "seo_description"] as const;
/** Fields that count for the tab completeness dot. */
export const POST_REQUIRED_FIELDS = ["title", "excerpt", "body"] as const;

/** Search-engine display limits (soft; the API accepts up to 200 / 300 characters). */
export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;
export const DEFAULT_AUTHOR = "Zodiac Blend";

export interface PostFormValues {
  slug: string;
  author_name: string;
  cover_image_url: string | null;
  translations: Translations<PostTranslation>;
  /** ISO UTC; null = set when published. A future date schedules the post. */
  published_at: string | null;
}

export function postToForm(post: PostAdmin | null, locales: Locale[]): PostFormValues {
  return {
    slug: post?.slug ?? "",
    author_name: post?.author_name ?? DEFAULT_AUTHOR,
    cover_image_url: post?.cover_image_url ?? null,
    translations: fillTranslations<PostTranslation>(post?.translations, locales, POST_FIELDS),
    published_at: post?.published_at ?? null,
  };
}

export function postCreatePayload(values: PostFormValues): PostCreate {
  return {
    slug: values.slug.trim().toLowerCase(),
    translations: cleanTranslations(values.translations),
    cover_image_url: emptyToNull(values.cover_image_url),
    author_name: values.author_name.trim() || DEFAULT_AUTHOR,
  };
}

function updatePayload(values: PostFormValues): PostUpdate {
  return { ...postCreatePayload(values), published_at: values.published_at };
}

/** Changed fields only (PATCH body); empty object = nothing to save. */
export function postPatch(initial: PostFormValues, values: PostFormValues): PostUpdate {
  return diffFields(updatePayload(initial), updatePayload(values));
}

export function validatePost(
  values: PostFormValues,
  defaultLocale: Locale,
): Record<string, string> {
  const errors: Record<string, string> = {
    ...validateTranslations<PostTranslation>(values.translations, {
      defaultLocale,
      maxLengths: {
        title: LIMITS.title,
        excerpt: LIMITS.excerpt,
        body: LIMITS.longMarkdown,
        seo_title: LIMITS.title,
        seo_description: LIMITS.shortText,
      },
    }),
  };
  const slug = validateSlug(values.slug, LIMITS.postSlug);
  if (slug) errors.slug = slug;
  const author = values.author_name.trim();
  if (author.length > LIMITS.title) errors.author_name = "Use at most 200 characters.";
  return errors;
}

/* ================================================================== status & publishing */

export type PostDisplayStatus = "draft" | "published" | "scheduled";

/** A published post with a future date is scheduled (hidden publicly until then). */
export function postDisplayStatus(
  post: Pick<PostAdminSummary, "status" | "published_at">,
  now: number = Date.now(),
): PostDisplayStatus {
  if (post.status !== "published") return "draft";
  if (isFutureDate(post.published_at, now)) return "scheduled";
  return "published";
}

/** Is an ISO date later than `now`? (null/invalid → false) */
export function isFutureDate(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return !Number.isNaN(time) && time > now;
}

export const POST_STATUS_LABELS: Record<PostDisplayStatus, string> = {
  draft: "Draft",
  published: "Published",
  scheduled: "Scheduled",
};

export type PublishAction = "publish" | "schedule" | "unpublish";

/**
 * The primary publishing action for a post given the (possibly unsaved) publication date:
 * drafts are published now or scheduled (future date); published/scheduled posts can be
 * unpublished (back to draft).
 */
export function primaryPublishAction(
  status: PostDisplayStatus,
  publishedAt: string | null,
  now: number = Date.now(),
): PublishAction {
  if (status !== "draft") return "unpublish";
  return isFutureDate(publishedAt, now) ? "schedule" : "publish";
}

/** Public URL path of a post in a locale (`/en/blog/<slug>`). */
export function publicPostPath(locale: Locale, slug: string): string {
  return `/${locale}/blog/${encodeURIComponent(slug)}`;
}

/** Locales that have a title (= are listed publicly in that language). */
export function titledLocales(values: PostFormValues, locales: Locale[]): Locale[] {
  return locales.filter((locale) => values.translations[locale]?.title?.trim());
}
