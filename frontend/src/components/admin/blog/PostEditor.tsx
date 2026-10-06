"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DateTimeInput } from "@/components/admin/DateTimeInput";
import { EmptyState } from "@/components/admin/EmptyState";
import { Field, TextArea, TextInput } from "@/components/admin/form";
import { Icon } from "@/components/admin/icons";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, LoadingState } from "@/components/admin/QueryState";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import {
  clearErrors,
  counterTone,
  errorLocales,
  errorSummary,
  LIMITS,
  normalizeFieldErrors,
  slugify,
  translationError,
} from "@/components/admin/content/forms";
import { refreshPublicSite } from "@/components/admin/content/publicRefresh";
import { SaveBar } from "@/components/admin/content/SaveBar";
import { useSaveShortcut } from "@/components/admin/content/useSaveShortcut";
import { useUnsavedChanges } from "@/components/admin/content/useUnsavedChanges";
import { adminApi, toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage, adminFieldErrors } from "@/lib/admin/errors";
import { formatDateTime, formatRelative } from "@/lib/admin/format";
import { useAdminLocales, useAdminMutation, useAdminQuery } from "@/lib/admin/hooks";
import { toast } from "@/lib/admin/toast";
import { localeLabel } from "@/lib/admin/translations";
import type { DeleteOut, Locale, PostAdmin, PostTranslation, PostUpdate } from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";
import { cn } from "@/lib/cn";
import {
  POST_STATUS_LABELS,
  postCreatePayload,
  postDisplayStatus,
  postPatch,
  postToForm,
  isFutureDate,
  primaryPublishAction,
  publicPostPath,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  validatePost,
  type PostFormValues,
  type PublishAction,
} from "./postForm";

const FORM_ID = "post-form";

const FIELD_LABELS: Record<string, string> = {
  seo_title: "SEO title",
  seo_description: "SEO description",
  author_name: "Author",
  cover_image_url: "Cover image",
  published_at: "Publication date",
};

function notifyInvalid(errors: Record<string, string>) {
  const lines = errorSummary(errors, FIELD_LABELS);
  toast.error("Some fields need attention.", {
    description: lines.slice(0, 3).join(" ") + (lines.length > 3 ? " …" : ""),
  });
}

/* ================================================================== small pieces */

function Counter({ length, max }: { length: number; max: number }) {
  const tone = counterTone(length, max);
  return (
    <span
      className={cn(
        "text-xs font-normal tabular-nums",
        tone === "over"
          ? "font-medium text-danger"
          : tone === "near"
            ? "text-warning"
            : "text-ink-soft",
      )}
      aria-live={tone === "ok" ? undefined : "polite"}
    >
      {length}/{max}
      {tone === "over" ? <span className="sr-only"> — longer than search engines show</span> : null}
    </span>
  );
}

/** Search-result style preview of the title, address and description. */
function SearchPreview({
  title,
  description,
  slug,
  locale,
  dir,
}: {
  title: string;
  description: string;
  slug: string;
  locale: Locale;
  dir: "ltr" | "rtl";
}) {
  const clip = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  return (
    <figure className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <figcaption className="mb-2 text-[0.7rem] font-semibold tracking-wider text-ink-soft uppercase">
        Search preview
      </figcaption>
      <div lang={locale} dir={dir}>
        <p className="truncate text-xs text-stone-500" dir="ltr">
          zodiacblend.com › {locale} › blog › {slug || "…"}
        </p>
        <p className="mt-0.5 truncate text-[1.05rem] leading-snug text-[#1a3a8f]">
          {title ? clip(title, SEO_TITLE_MAX) : <span className="text-stone-400">Post title</span>}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-soft">
          {description ? (
            clip(description, SEO_DESCRIPTION_MAX)
          ) : (
            <span className="text-stone-400">The excerpt is used when this is empty.</span>
          )}
        </p>
      </div>
    </figure>
  );
}

/* ================================================================== publishing panel */

const ACTION_LABELS: Record<PublishAction, string> = {
  publish: "Publish now",
  schedule: "Schedule",
  unpublish: "Unpublish",
};

function PublishingPanel({
  post,
  values,
  isNew,
  dirty,
  busy,
  error,
  locales,
  onDateChange,
  dateError,
  onAction,
  onPublishNow,
}: {
  post: PostAdmin | null;
  values: PostFormValues;
  isNew: boolean;
  dirty: boolean;
  busy: PublishAction | "now" | null;
  error: ReactNode;
  locales: Locale[];
  onDateChange: (iso: string | null) => void;
  dateError?: string;
  onAction: (action: PublishAction) => void;
  onPublishNow: () => void;
}) {
  // Not memoised on purpose: re-evaluated on every render, right after each server response.
  const status = post ? postDisplayStatus(post) : "draft";
  const action = primaryPublishAction(status, values.published_at);
  const label =
    dirty && !isNew ? `Save and ${ACTION_LABELS[action].toLowerCase()}` : ACTION_LABELS[action];
  const pastDate =
    status === "draft" && post?.published_at && !isFutureDate(post.published_at)
      ? post.published_at
      : null;
  const live = status === "published" && post;

  return (
    <Panel title="Publishing">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5" aria-live="polite">
          <StatusBadge kind="post" status={status} label={POST_STATUS_LABELS[status]} />
          <p className="text-[0.8125rem] text-ink-soft">
            {status === "draft"
              ? "Only visible here."
              : status === "scheduled"
                ? `Appears on ${formatDateTime(post!.published_at)}${
                    formatRelative(post!.published_at).startsWith("in ")
                      ? ` (${formatRelative(post!.published_at)})`
                      : ""
                  }.`
                : `Live since ${formatDateTime(post!.published_at)}.`}
          </p>
        </div>

        <Field
          label="Publication date"
          error={dateError}
          hint={
            status === "draft"
              ? pastDate && values.published_at === pastDate
                ? "Publishing again keeps this original date. Clear it to use the moment you publish."
                : "Empty: the moment you publish. A future date schedules the post."
              : "A future date hides the post until then."
          }
        >
          <DateTimeInput value={values.published_at} onChange={onDateChange} disabled={isNew} />
        </Field>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            <Icon name="alert" className="mt-0.5 size-4" />
            <span>{error}</span>
          </p>
        ) : null}

        {isNew ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-[0.8125rem] text-ink-soft ring-1 ring-stone-200 ring-inset">
            Create the draft first; then you can publish or schedule it.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <AdminButton
              variant={action === "unpublish" ? "secondary" : "gold"}
              icon={action === "unpublish" ? "eye" : action === "schedule" ? "calendar" : "sparkle"}
              loading={busy === action}
              disabled={busy !== null}
              onClick={() => onAction(action)}
              fullWidth
            >
              {label}
            </AdminButton>
            {status === "scheduled" ? (
              <AdminButton
                variant="ghost"
                size="sm"
                loading={busy === "now"}
                disabled={busy !== null}
                onClick={onPublishNow}
                fullWidth
              >
                Publish now instead
              </AdminButton>
            ) : null}
          </div>
        )}

        {live ? (
          <div className="border-t border-stone-100 pt-3">
            <p className="mb-1.5 text-xs font-medium text-ink-soft">On the site</p>
            <ul className="space-y-1">
              {locales
                .filter((locale) => post.available_locales.includes(locale))
                .map((locale) => (
                  <li key={locale}>
                    <a
                      href={publicPostPath(locale, post.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink hover:underline"
                    >
                      <Icon name="external" className="size-3.5 text-stone-500" />
                      {localeLabel(locale)}
                      <span className="font-mono text-xs font-normal text-ink-soft" dir="ltr">
                        {publicPostPath(locale, post.slug)}
                      </span>
                    </a>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/* ================================================================== editor */

interface FormState {
  key: string;
  initial: PostFormValues;
  values: PostFormValues;
}

/**
 * Create (`id="new"`) or edit a blog post: per-language title, excerpt, Markdown body and SEO
 * fields (with counters and a search preview), slug, author, cover, and the publishing workflow
 * (publish now, schedule with a future date, unpublish). Unsaved edits are guarded.
 */
export function PostEditor({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === "new";
  const numericId = /^\d+$/.test(id) ? Number(id) : null;
  const { locales, defaultLocale } = useAdminLocales();
  const query = useAdminQuery<PostAdmin>(numericId ? `/blog-posts/${numericId}` : null);
  const post = query.data ?? null;

  const sourceKey = isNew ? "new" : post ? `${post.id}:${post.updated_at}:${post.status}` : null;
  const [form, setForm] = useState<FormState | null>(null);
  if (sourceKey && form?.key !== sourceKey) {
    const initial = postToForm(isNew ? null : post, locales);
    setForm({ key: sourceKey, initial, values: initial });
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<PublishAction | "now" | "save" | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const values = form?.values;
  const patch = form && !isNew ? postPatch(form.initial, form.values) : {};
  const dirty = form
    ? isNew
      ? JSON.stringify(form.values) !== JSON.stringify(form.initial)
      : Object.keys(patch).length > 0
    : false;

  const remove = useAdminMutation(() => adminApi.delete<DeleteOut>(`/blog-posts/${numericId}`), {
    successMessage: "Post deleted",
    errorMessage: false,
    onSuccess: () => {
      refreshPublicSite(CACHE_TAGS.blog);
      setForm((prev) => (prev ? { ...prev, initial: prev.values } : prev));
      router.push("/admin/blog");
    },
  });

  useUnsavedChanges(dirty && busy === null);

  const set = <K extends keyof PostFormValues>(field: K, value: PostFormValues[K]) => {
    setForm((prev) => (prev ? { ...prev, values: { ...prev.values, [field]: value } } : prev));
    setErrors((prev) => clearErrors(prev, field));
  };

  /** Validate and PATCH/POST pending changes; returns the saved post, or null on failure. */
  const persist = async (overrides: PostUpdate = {}): Promise<PostAdmin | null> => {
    if (!form) return null;
    const found = validatePost(form.values, defaultLocale);
    setErrors(found);
    if (Object.keys(found).length) {
      notifyInvalid(found);
      return null;
    }
    const body = { ...patch, ...overrides };
    try {
      if (isNew) {
        const created = await adminApi.post<PostAdmin>(
          "/blog-posts",
          postCreatePayload(form.values),
        );
        return created;
      }
      if (!Object.keys(body).length) return post;
      const saved = await adminApi.patch<PostAdmin>(`/blog-posts/${numericId}`, body);
      return saved;
    } catch (err) {
      const error = toAdminApiError(err);
      if (error.isUnauthorized) return null;
      const fields = normalizeFieldErrors(adminFieldErrors(error));
      if (error.code === "slug_taken") fields.slug = "Another post already uses this slug.";
      setErrors(fields);
      if (Object.keys(fields).length) notifyInvalid(fields);
      else toast.error("The post was not saved", { description: adminErrorMessage(error) });
      return null;
    }
  };

  const afterSave = (saved: PostAdmin, message: string | null) => {
    refreshPublicSite(CACHE_TAGS.blog);
    setErrors({});
    if (message) toast.success(message);
    if (isNew) {
      setForm((prev) => (prev ? { ...prev, initial: prev.values } : prev));
      router.replace(`/admin/blog/${saved.id}`);
    } else {
      query.setData(saved);
    }
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!form || busy) return;
    if (!dirty) return;
    setBusy("save");
    setPublishError(null);
    try {
      const saved = await persist();
      if (saved) afterSave(saved, isNew ? "Draft created" : "Post saved");
    } finally {
      setBusy(null);
    }
  };

  const runPublishing = async (action: PublishAction | "now") => {
    if (!form || busy || isNew) return;
    setBusy(action);
    setPublishError(null);
    try {
      const now = new Date().toISOString();
      const saved = await persist(action === "now" ? { published_at: now } : {});
      if (!saved) return;
      let result = saved;
      if (action === "publish" || action === "schedule") {
        try {
          result = await adminApi.post<PostAdmin>(`/blog-posts/${saved.id}/publish`);
        } catch (err) {
          const error = toAdminApiError(err);
          query.setData(saved);
          if (error.isUnauthorized) return;
          setPublishError(
            error.code === "post_incomplete"
              ? `Write the ${localeLabel(defaultLocale)} post body before publishing.`
              : adminErrorMessage(error),
          );
          return;
        }
      } else if (action === "unpublish") {
        result = await adminApi.post<PostAdmin>(`/blog-posts/${saved.id}/unpublish`);
      }
      afterSave(
        result,
        action === "unpublish"
          ? "Post unpublished: it is a draft again"
          : action === "schedule"
            ? `Post scheduled for ${formatDateTime(result.published_at)}`
            : "Post published",
      );
    } catch (err) {
      const error = toAdminApiError(err);
      if (!error.isUnauthorized) setPublishError(adminErrorMessage(error));
      void query.refetch();
    } finally {
      setBusy(null);
    }
  };

  useSaveShortcut(() => void save(), dirty && busy === null);

  /* ---------------- states */
  const breadcrumbs = [{ label: "Blog", href: "/admin/blog" }];
  if ((!isNew && numericId === null) || (query.error?.isNotFound && !query.data)) {
    return (
      <>
        <PageHeader title="Post not found" breadcrumbs={breadcrumbs} />
        <Panel>
          <EmptyState
            icon="blog"
            title="This post does not exist"
            description="The link may be wrong, or the post was deleted."
            action={
              <AdminButtonLink href="/admin/blog" size="sm">
                Back to the blog
              </AdminButtonLink>
            }
          />
        </Panel>
      </>
    );
  }
  if (!isNew && query.error && !post) {
    return (
      <>
        <PageHeader title="Blog post" breadcrumbs={breadcrumbs} />
        <Panel>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Panel>
      </>
    );
  }
  if (!form || !values) {
    return (
      <>
        <PageHeader title="Blog post" breadcrumbs={breadcrumbs} />
        <Panel>
          <LoadingState label="Loading post…" lines={8} />
        </Panel>
      </>
    );
  }

  const status = post ? postDisplayStatus(post) : null;
  const title = isNew
    ? "New post"
    : (post ?? form.initial).translations[defaultLocale]?.title?.trim() || "Untitled post";
  const saving = busy !== null;

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[...breadcrumbs, { label: isNew ? "New" : post!.slug }]}
        badge={
          status ? (
            <StatusBadge kind="post" status={status} label={POST_STATUS_LABELS[status]} />
          ) : null
        }
        actions={
          post ? (
            <>
              {status === "published" ? (
                <AdminButtonLink
                  href={publicPostPath(defaultLocale, post.slug)}
                  external
                  size="sm"
                  icon="external"
                >
                  View on site
                </AdminButtonLink>
              ) : null}
              <AdminButton
                size="sm"
                variant="dangerGhost"
                icon="trash"
                onClick={() => {
                  remove.reset();
                  setConfirmDelete(true);
                }}
              >
                Delete
              </AdminButton>
            </>
          ) : null
        }
      />

      <form id={FORM_ID} onSubmit={save} noValidate>
        <fieldset disabled={saving} className="min-w-0">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-5">
              <Panel title="Cover image">
                <ImagePicker
                  label={<span className="sr-only">Cover image</span>}
                  value={values.cover_image_url}
                  onChange={(url) => set("cover_image_url", url)}
                  error={errors.cover_image_url}
                  hint="Shown on the blog list and at the top of the post (16:9)."
                />
              </Panel>
              <Panel
                title="Article"
                description="Write the post in each language. The English version is required; posts are listed in a language once they have a title in it."
              >
                <TranslationTabs<PostTranslation>
                  value={values.translations}
                  onChange={(translations) => {
                    setForm((prev) => {
                      if (!prev) return prev;
                      const next = {
                        ...prev.values,
                        translations: translations as PostFormValues["translations"],
                      };
                      if (isNew && !slugTouched) {
                        next.slug = slugify(
                          translations[defaultLocale]?.title ?? "",
                          LIMITS.postSlug,
                        );
                      }
                      return { ...prev, values: next };
                    });
                    setErrors((prev) =>
                      clearErrors(prev, "translations", ...(isNew && !slugTouched ? ["slug"] : [])),
                    );
                    setPublishError(null);
                  }}
                  fields={["title", "excerpt", "body"]}
                  errorLocales={errorLocales(errors)}
                  missingHint={`Not translated yet: this post is not listed in this language, and its link shows the ${localeLabel(defaultLocale)} version.`}
                >
                  {({ locale, entry, set: setField, fieldProps, isDefault, dir }) => (
                    <>
                      <Field
                        label="Title"
                        required={isDefault}
                        error={translationError(errors, locale, "title")}
                      >
                        <TextInput
                          {...fieldProps}
                          value={entry.title ?? ""}
                          onChange={(event) => setField("title", event.target.value)}
                          maxLength={LIMITS.title}
                          className="h-11 text-base font-medium"
                        />
                      </Field>
                      <Field
                        label="Excerpt"
                        optionalLabel={
                          <Counter length={(entry.excerpt ?? "").length} max={LIMITS.excerpt} />
                        }
                        hint="One or two sentences for the blog list and link previews."
                        error={translationError(errors, locale, "excerpt")}
                      >
                        <TextArea
                          {...fieldProps}
                          value={entry.excerpt ?? ""}
                          onChange={(event) => setField("excerpt", event.target.value)}
                          rows={3}
                          maxLength={LIMITS.excerpt}
                        />
                      </Field>
                      <Field
                        label="Body"
                        error={translationError(errors, locale, "body")}
                        hint={isDefault ? "Required before the post can be published." : undefined}
                      >
                        <MarkdownEditor
                          {...fieldProps}
                          value={entry.body ?? ""}
                          onChange={(body) => setField("body", body)}
                          rows={22}
                          maxLength={LIMITS.longMarkdown}
                        />
                      </Field>
                      <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                        <div>
                          <h3 className="text-sm font-semibold text-ink">Search engines</h3>
                          <p className="text-xs text-ink-soft">
                            Optional. When empty, the title and excerpt are used.
                          </p>
                        </div>
                        <Field
                          label="SEO title"
                          optionalLabel={
                            <Counter length={(entry.seo_title ?? "").length} max={SEO_TITLE_MAX} />
                          }
                          error={translationError(errors, locale, "seo_title")}
                        >
                          <TextInput
                            {...fieldProps}
                            value={entry.seo_title ?? ""}
                            onChange={(event) => setField("seo_title", event.target.value)}
                            maxLength={LIMITS.title}
                            placeholder={entry.title || undefined}
                          />
                        </Field>
                        <Field
                          label="SEO description"
                          optionalLabel={
                            <Counter
                              length={(entry.seo_description ?? "").length}
                              max={SEO_DESCRIPTION_MAX}
                            />
                          }
                          error={translationError(errors, locale, "seo_description")}
                        >
                          <TextArea
                            {...fieldProps}
                            value={entry.seo_description ?? ""}
                            onChange={(event) => setField("seo_description", event.target.value)}
                            rows={2}
                            maxLength={LIMITS.shortText}
                            placeholder={entry.excerpt || undefined}
                          />
                        </Field>
                        <SearchPreview
                          title={(entry.seo_title || entry.title || "").trim()}
                          description={(entry.seo_description || entry.excerpt || "").trim()}
                          slug={values.slug}
                          locale={locale}
                          dir={dir}
                        />
                      </div>
                    </>
                  )}
                </TranslationTabs>
              </Panel>
            </div>

            <div className="min-w-0 space-y-5">
              <PublishingPanel
                post={post}
                values={values}
                isNew={isNew}
                dirty={dirty}
                busy={busy === "save" ? null : busy}
                error={publishError}
                locales={locales}
                dateError={errors.published_at}
                onDateChange={(iso) => {
                  set("published_at", iso);
                  setPublishError(null);
                }}
                onAction={(action) => void runPublishing(action)}
                onPublishNow={() => void runPublishing("now")}
              />

              <Panel title="Post settings">
                <div className="space-y-4">
                  <Field
                    label="Slug"
                    required
                    error={errors.slug}
                    hint={
                      <>
                        Address:{" "}
                        <span className="font-mono break-all" dir="ltr">
                          /blog/{values.slug || "…"}
                        </span>
                        {status === "published" ? " · changing it breaks existing links." : null}
                      </>
                    }
                  >
                    <TextInput
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      value={values.slug}
                      onChange={(event) => {
                        setSlugTouched(true);
                        set("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"));
                      }}
                      maxLength={LIMITS.postSlug}
                      className="font-mono text-[0.8125rem]"
                    />
                  </Field>
                  <Field label="Author" error={errors.author_name}>
                    <TextInput
                      value={values.author_name}
                      onChange={(event) => set("author_name", event.target.value)}
                      maxLength={LIMITS.title}
                    />
                  </Field>
                  {post ? (
                    <p className="text-xs text-ink-soft">
                      Created {formatDateTime(post.created_at)} · edited{" "}
                      {formatRelative(post.updated_at)}
                    </p>
                  ) : null}
                </div>
              </Panel>
            </div>
          </div>
        </fieldset>
      </form>

      <SaveBar
        dirty={dirty}
        saving={busy === "save"}
        formId={FORM_ID}
        saveLabel={isNew ? "Create draft" : status === "draft" ? "Save draft" : "Save changes"}
        status={isNew ? "New post · not saved yet" : "Unsaved changes"}
        cleanStatus={isNew ? "New post" : "All changes saved"}
        note={
          status && status !== "draft"
            ? "Saved changes appear on the public site within about a minute."
            : "Drafts are private until you publish them."
        }
        onDiscard={
          isNew
            ? undefined
            : () => {
                setForm((prev) => (prev ? { ...prev, values: prev.initial } : prev));
                setErrors({});
                setPublishError(null);
              }
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutateAsync()}
        tone="danger"
        title="Delete this post?"
        description={
          status === "published"
            ? "It disappears from the blog at once and its links stop working. This cannot be undone."
            : "This cannot be undone."
        }
        confirmLabel="Delete post"
        confirmText={status === "published" ? post?.slug : undefined}
      />
    </>
  );
}
