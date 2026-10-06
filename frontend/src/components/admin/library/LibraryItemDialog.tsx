"use client";

import { useId, useState, type FormEvent } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { Field, Switch, TextInput } from "@/components/admin/form";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";
import { Modal } from "@/components/admin/Modal";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import {
  clearErrors,
  errorLocales,
  LIMITS,
  normalizeFieldErrors,
  slugify,
  translationError,
} from "@/components/admin/content/forms";
import { FormErrorAlert } from "@/components/admin/content/FormErrorAlert";
import { refreshPublicSite } from "@/components/admin/content/publicRefresh";
import { adminApi } from "@/lib/admin/api";
import { adminErrorMessage, adminFieldErrors } from "@/lib/admin/errors";
import { useAdminLocales, useAdminMutation } from "@/lib/admin/hooks";
import type { BookAdmin, LibraryTranslation, SeriesAdmin } from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";
import {
  LIBRARY_FIELDS,
  libraryPatch,
  libraryPayload,
  libraryTitle,
  libraryToForm,
  validateLibrary,
  type LibraryEntity,
  type LibraryFormValues,
} from "./libraryForm";

export type LibraryDialogTarget =
  | { entity: "series"; item: SeriesAdmin | null; sortOrder: number }
  | { entity: "book"; series: SeriesAdmin; item: BookAdmin | null; sortOrder: number };

const LABELS: Record<LibraryEntity, { noun: string; path: string }> = {
  series: { noun: "series", path: "/library/" },
  book: { noun: "book", path: "" },
};

function LibraryForm({
  target,
  onClose,
  onSaved,
  onPendingChange,
}: {
  target: LibraryDialogTarget;
  onClose: () => void;
  onSaved: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const formId = useId();
  const { locales, defaultLocale } = useAdminLocales();
  const { entity, item } = target;
  const isNew = item === null;
  const [initial] = useState(() => libraryToForm(item, locales, { sort_order: target.sortOrder }));
  const [values, setValues] = useState<LibraryFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const save = useAdminMutation(
    (body: Record<string, unknown>): Promise<SeriesAdmin | BookAdmin> => {
      if (entity === "series") {
        return isNew
          ? adminApi.post<SeriesAdmin>("/book-series", body)
          : adminApi.patch<SeriesAdmin>(`/book-series/${item!.id}`, body);
      }
      return isNew
        ? adminApi.post<BookAdmin>(`/book-series/${target.series.id}/books`, body)
        : adminApi.patch<BookAdmin>(`/books/${item!.id}`, body);
    },
    {
      errorMessage: false, // shown in the dialog
      successMessage: (saved) =>
        `${entity === "series" ? "Series" : "Book"} “${libraryTitle(saved, defaultLocale)}” ${isNew ? "created" : "saved"}`,
      onError: (error) => {
        onPendingChange(false);
        const fields = normalizeFieldErrors(adminFieldErrors(error));
        if (error.code === "slug_taken") {
          fields.slug =
            entity === "series"
              ? "Another series already uses this slug."
              : "Another book in this series already uses this slug.";
        }
        setErrors(fields);
        setFormError(Object.keys(fields).length ? null : adminErrorMessage(error));
      },
      onSuccess: () => {
        onPendingChange(false);
        refreshPublicSite(CACHE_TAGS.library);
        onSaved();
      },
    },
  );

  const set = <K extends keyof LibraryFormValues>(field: K, value: LibraryFormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => clearErrors(prev, field));
    setFormError(null);
  };

  const patch = isNew ? null : libraryPatch(entity, initial, values);
  const dirty = isNew || Object.keys(patch ?? {}).length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (save.pending) return;
    const found = validateLibrary(entity, values, defaultLocale);
    setErrors(found);
    setSubmitted(true);
    if (Object.keys(found).length) {
      setFormError(null);
      return;
    }
    setFormError(null);
    if (!dirty) {
      onClose();
      return;
    }
    onPendingChange(true);
    void save.mutate(
      (isNew ? libraryPayload(entity, values) : patch) as unknown as Record<string, unknown>,
    );
  };

  return (
    <>
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        <FormErrorAlert
          message={formError}
          errors={submitted ? errors : undefined}
          labels={{ purchase_url: "Purchase link", cover_image_url: "Cover" }}
        />
        <fieldset disabled={save.pending} className="min-w-0 space-y-5">
          <TranslationTabs<LibraryTranslation>
            value={values.translations}
            onChange={(translations) => {
              setValues((prev) => {
                const next = {
                  ...prev,
                  translations: translations as LibraryFormValues["translations"],
                };
                if (!slugTouched) next.slug = slugify(translations[defaultLocale]?.title ?? "");
                return next;
              });
              setErrors((prev) =>
                clearErrors(prev, "translations", ...(slugTouched ? [] : ["slug"])),
              );
              setFormError(null);
            }}
            fields={LIBRARY_FIELDS}
            errorLocales={errorLocales(errors)}
          >
            {({ locale, entry, set: setField, fieldProps, isDefault }) => (
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
                  />
                </Field>
                <Field label="Description" error={translationError(errors, locale, "description")}>
                  <MarkdownEditor
                    {...fieldProps}
                    value={entry.description ?? ""}
                    onChange={(description) => setField("description", description)}
                    rows={7}
                    maxLength={LIMITS.markdown}
                    defaultView="write"
                  />
                </Field>
              </>
            )}
          </TranslationTabs>

          <ImagePicker
            label="Cover"
            aspect="portrait"
            value={values.cover_image_url}
            onChange={(url) => set("cover_image_url", url)}
            error={errors.cover_image_url}
            hint="Portrait image (about 3:4) for the library pages."
          />

          {entity === "book" ? (
            <Field
              label="Purchase link"
              error={errors.purchase_url}
              hint="Where readers buy the book (https://…). Leave empty to hide the buy button."
            >
              <TextInput
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={values.purchase_url}
                onChange={(event) => set("purchase_url", event.target.value)}
                placeholder="https://"
                maxLength={LIMITS.link}
              />
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field
              label="Slug"
              required
              error={errors.slug}
              hint={
                entity === "series" ? (
                  <>
                    Address:{" "}
                    <span className="font-mono break-all" dir="ltr">
                      {LABELS.series.path}
                      {values.slug || "…"}
                    </span>
                  </>
                ) : (
                  "Unique within the series."
                )
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
                maxLength={LIMITS.slug}
                className="font-mono text-[0.8125rem]"
              />
            </Field>
            <Field label="Sort order" error={errors.sort_order} hint="Lower first.">
              <TextInput
                inputMode="numeric"
                dir="ltr"
                value={values.sort_order}
                onChange={(event) => set("sort_order", event.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>

          <Switch
            label="Published"
            description={
              entity === "series"
                ? "Visible in the Galaxy Library (with its published books)."
                : "Visible in its series once the series is published."
            }
            checked={values.is_published}
            onChange={(checked) => set("is_published", checked)}
          />
        </fieldset>
      </form>
      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-stone-200/80 bg-stone-50 px-5 py-3">
        <AdminButton onClick={onClose} disabled={save.pending}>
          Cancel
        </AdminButton>
        <AdminButton
          type="submit"
          form={formId}
          variant="primary"
          loading={save.pending}
          disabled={!dirty}
        >
          {isNew ? `Create ${LABELS[entity].noun}` : "Save changes"}
        </AdminButton>
      </div>
    </>
  );
}

/** Create / edit a book series or a book in a modal (errors shown inside it). */
export function LibraryItemDialog({
  target,
  onClose,
  onSaved,
}: {
  target: LibraryDialogTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const { defaultLocale } = useAdminLocales();
  const title = !target
    ? ""
    : target.item
      ? `Edit “${libraryTitle(target.item, defaultLocale)}”`
      : target.entity === "series"
        ? "New series"
        : "New book";
  const description = !target
    ? undefined
    : target.entity === "book"
      ? `In the series “${libraryTitle(target.series, defaultLocale)}”.`
      : "A collection of books shown together in the Galaxy Library.";
  return (
    <Modal
      open={target !== null}
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissible={!pending}
      size="xl"
      title={title}
      description={description}
    >
      {target ? (
        <LibraryForm
          key={`${target.entity}:${target.item?.id ?? "new"}`}
          target={target}
          onClose={onClose}
          onSaved={onSaved}
          onPendingChange={setPending}
        />
      ) : null}
    </Modal>
  );
}
