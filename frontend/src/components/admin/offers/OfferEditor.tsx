"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DateTimeInput } from "@/components/admin/DateTimeInput";
import { EmptyState } from "@/components/admin/EmptyState";
import { Field, SelectInput, Switch, TextInput } from "@/components/admin/form";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, LoadingState } from "@/components/admin/QueryState";
import { Badge } from "@/components/admin/StatusBadge";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import {
  clearErrors,
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
import { adminApi } from "@/lib/admin/api";
import { adminFieldErrors } from "@/lib/admin/errors";
import { formatDateTime } from "@/lib/admin/format";
import { useAdminLocales, useAdminMutation, useAdminQuery } from "@/lib/admin/hooks";
import { toast } from "@/lib/admin/toast";
import type {
  AdminPage,
  DeleteOut,
  Discount,
  OfferAdmin,
  OfferCreate,
  OfferTranslation,
  OfferUpdate,
} from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";
import { DISCOUNT_STATE_STYLE, discountOptionLabel, discountState } from "./discountForm";
import {
  OFFER_FIELDS,
  OFFER_STATUS_STYLE,
  offerPatch,
  offerPayload,
  offerStatus,
  offerTitle,
  offerToForm,
  validateOffer,
  type OfferFormValues,
} from "./offerForm";

const FORM_ID = "offer-form";

const FIELD_LABELS: Record<string, string> = {
  cta_url: "Button link",
  cta_label: "button label",
  discount_code_id: "Discount code",
  image_url: "Image",
  ends_at: "Ends",
  starts_at: "Starts",
};

function notifyInvalid(errors: Record<string, string>) {
  const lines = errorSummary(errors, FIELD_LABELS);
  toast.error("Some fields need attention.", {
    description: lines.slice(0, 3).join(" ") + (lines.length > 3 ? " …" : ""),
  });
}

/* ================================================================== discount field */

function DiscountField({
  value,
  onChange,
  linkedCode,
  error,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  /** Code of the currently linked discount (from the offer), for editors. */
  linkedCode: string | null;
  error?: string;
}) {
  const { can } = useAdminAuth();
  const manager = can("manager");
  const discounts = useAdminQuery<AdminPage<Discount>>(manager ? "/discounts" : null, {
    query: { page_size: 100 },
  });
  const [idText, setIdText] = useState(value ? String(value) : "");
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setIdText(value ? String(value) : "");
  }

  // Editors cannot list discount codes (403): enter the numeric id instead.
  if (!manager || discounts.error?.isForbidden) {
    return (
      <Field
        label="Discount code ID"
        error={error}
        hint={
          <>
            {linkedCode ? (
              <>
                Currently linked:{" "}
                <span className="font-mono font-medium text-ink">{linkedCode}</span>.{" "}
              </>
            ) : null}
            Only managers can browse discount codes. Enter the code’s ID, or leave empty for none.
          </>
        }
      >
        <TextInput
          inputMode="numeric"
          dir="ltr"
          value={idText}
          placeholder="None"
          className="max-w-32"
          onChange={(event) => {
            const text = event.target.value.replace(/[^\d]/g, "");
            setIdText(text);
            const next = text ? Number(text) : null;
            setSynced(next);
            onChange(next);
          }}
        />
      </Field>
    );
  }

  const items = discounts.data?.items ?? [];
  const selected = items.find((d) => d.id === value) ?? null;
  const state = selected ? discountState(selected) : null;
  return (
    <Field
      label="Discount code"
      error={error ?? (discounts.error ? "Couldn't load discount codes." : undefined)}
      hint={
        selected && state && state !== "active" ? (
          <span className="text-warning">
            This code is {DISCOUNT_STATE_STYLE[state].label.toLowerCase()}: the offer will not show
            it until it can be used at checkout.
          </span>
        ) : (
          "Shown on the offer and applied at checkout. Manage codes on the Discounts page."
        )
      }
    >
      <SelectInput
        value={value === null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        disabled={discounts.loading}
      >
        <option value="">{discounts.loading ? "Loading codes…" : "No discount code"}</option>
        {value !== null && !selected && !discounts.loading ? (
          <option value={String(value)}>{linkedCode ?? `Code #${value}`}</option>
        ) : null}
        {items.map((discount) => (
          <option key={discount.id} value={String(discount.id)}>
            {discountOptionLabel(discount)}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}

/* ================================================================== status preview */

function VisibilityPreview({ values, isNew }: { values: OfferFormValues; isNew: boolean }) {
  const status = offerStatus(values);
  const style = OFFER_STATUS_STYLE[status];
  const text =
    status === "live" && isNew
      ? "Goes live as soon as you create it."
      : status === "live"
        ? values.ends_at
          ? `Live until ${formatDateTime(values.ends_at)}.`
          : "Live with no end date."
        : status === "scheduled"
          ? `Goes live on ${formatDateTime(values.starts_at)}.`
          : status === "ended"
            ? `Ended on ${formatDateTime(values.ends_at)}.`
            : "Hidden from the site while inactive.";
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-stone-200 ring-inset">
      <Badge tone={style.tone} dot>
        {style.label}
      </Badge>
      <p className="text-[0.8125rem] text-ink-soft" aria-live="polite">
        {text}
        {values.show_banner && status === "live" ? " Shown in the site banner." : null}
      </p>
    </div>
  );
}

/* ================================================================== editor */

interface FormState {
  key: string;
  initial: OfferFormValues;
  values: OfferFormValues;
}

/**
 * Create (`id="new"`) or edit an offer: translations (title, subtitle, Markdown body, button
 * label), image, link, discount code, visibility window and order. Saves only changed fields.
 */
export function OfferEditor({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === "new";
  const numericId = /^\d+$/.test(id) ? Number(id) : null;
  const { locales, defaultLocale } = useAdminLocales();
  const query = useAdminQuery<OfferAdmin>(numericId ? `/offers/${numericId}` : null);
  const offer = query.data ?? null;

  const sourceKey = isNew ? "new" : offer ? `${offer.id}:${offer.updated_at}` : null;
  const [form, setForm] = useState<FormState | null>(null);
  if (sourceKey && form?.key !== sourceKey) {
    const initial = offerToForm(isNew ? null : offer, locales);
    setForm({ key: sourceKey, initial, values: initial });
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const values = form?.values;
  const patch = form && !isNew ? offerPatch(form.initial, form.values) : {};
  const dirty = form
    ? isNew
      ? JSON.stringify(form.values) !== JSON.stringify(form.initial)
      : Object.keys(patch).length > 0
    : false;

  const save = useAdminMutation(
    (body: { create?: OfferCreate; patch?: OfferUpdate }) =>
      body.create
        ? adminApi.post<OfferAdmin>("/offers", body.create)
        : adminApi.patch<OfferAdmin>(`/offers/${numericId}`, body.patch),
    {
      successMessage: (saved, body) =>
        body.create ? `Offer “${saved.slug}” created` : "Offer saved",
      errorMessage: (error) =>
        error.isValidation || error.code === "slug_taken" ? null : undefined,
      onError: (error) => {
        const fields = normalizeFieldErrors(adminFieldErrors(error));
        if (error.code === "slug_taken") fields.slug = "Another offer already uses this slug.";
        setErrors(fields);
        if (Object.keys(fields).length) notifyInvalid(fields);
      },
      onSuccess: (saved, body) => {
        refreshPublicSite(CACHE_TAGS.offers);
        setErrors({});
        if (body.create) {
          // Mark the form clean first so the unsaved-changes guard stays quiet.
          setForm((prev) => (prev ? { ...prev, initial: prev.values } : prev));
          router.replace(`/admin/offers/${saved.id}`);
        } else {
          query.setData(saved);
        }
      },
    },
  );

  const remove = useAdminMutation(() => adminApi.delete<DeleteOut>(`/offers/${numericId}`), {
    successMessage: "Offer deleted",
    errorMessage: false,
    onSuccess: () => {
      refreshPublicSite(CACHE_TAGS.offers);
      setForm((prev) => (prev ? { ...prev, initial: prev.values } : prev));
      router.push("/admin/offers");
    },
  });

  useUnsavedChanges(dirty && !save.pending);

  const set = <K extends keyof OfferFormValues>(field: K, value: OfferFormValues[K]) => {
    setForm((prev) => (prev ? { ...prev, values: { ...prev.values, [field]: value } } : prev));
    setErrors((prev) => clearErrors(prev, field));
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!form || save.pending) return;
    const found = validateOffer(form.values, defaultLocale);
    setErrors(found);
    if (Object.keys(found).length) {
      notifyInvalid(found);
      return;
    }
    if (isNew) void save.mutate({ create: offerPayload(form.values) });
    else if (Object.keys(patch).length) void save.mutate({ patch });
  };

  useSaveShortcut(() => submit(), dirty && !save.pending);

  /* ---------------- states */
  const breadcrumbs = [{ label: "Offers", href: "/admin/offers" }];
  if ((!isNew && numericId === null) || (query.error?.isNotFound && !query.data)) {
    return (
      <>
        <PageHeader title="Offer not found" breadcrumbs={breadcrumbs} />
        <Panel>
          <EmptyState
            icon="offers"
            title="This offer does not exist"
            description="The link may be wrong, or the offer was deleted."
            action={
              <AdminButtonLink href="/admin/offers" size="sm">
                Back to offers
              </AdminButtonLink>
            }
          />
        </Panel>
      </>
    );
  }
  if (!isNew && query.error && !offer) {
    return (
      <>
        <PageHeader title="Offer" breadcrumbs={breadcrumbs} />
        <Panel>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Panel>
      </>
    );
  }
  if (!form || !values) {
    return (
      <>
        <PageHeader title="Offer" breadcrumbs={breadcrumbs} />
        <Panel>
          <LoadingState label="Loading offer…" lines={6} />
        </Panel>
      </>
    );
  }

  const title = isNew ? "New offer" : offerTitle(offer!, defaultLocale);
  const savedStatus = offer ? offerStatus(offer) : null;
  const tabErrors = errorLocales(errors);

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[...breadcrumbs, { label: isNew ? "New" : offer!.slug }]}
        badge={
          savedStatus ? (
            <Badge tone={OFFER_STATUS_STYLE[savedStatus].tone} dot>
              {OFFER_STATUS_STYLE[savedStatus].label}
            </Badge>
          ) : null
        }
        actions={
          !isNew && offer ? (
            <>
              {offer.is_live ? (
                <AdminButtonLink
                  href={`/${defaultLocale}/offers/${offer.slug}`}
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

      <form id={FORM_ID} onSubmit={submit} noValidate>
        <fieldset disabled={save.pending} className="min-w-0">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-5">
              <Panel
                title="Content"
                description="Title and text per language. English is required; other languages fall back to English."
              >
                <TranslationTabs<OfferTranslation>
                  value={values.translations}
                  onChange={(translations) => {
                    setForm((prev) => {
                      if (!prev) return prev;
                      const next = {
                        ...prev.values,
                        translations: translations as OfferFormValues["translations"],
                      };
                      if (isNew && !slugTouched) {
                        next.slug = slugify(translations[defaultLocale]?.title ?? "");
                      }
                      return { ...prev, values: next };
                    });
                    setErrors((prev) =>
                      clearErrors(prev, "translations", ...(isNew && !slugTouched ? ["slug"] : [])),
                    );
                  }}
                  fields={OFFER_FIELDS}
                  errorLocales={tabErrors}
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
                          placeholder={
                            isDefault ? "Launch offer: 10% off your full report" : undefined
                          }
                        />
                      </Field>
                      <Field
                        label="Subtitle"
                        hint="One sentence under the title (also used in the banner)."
                        error={translationError(errors, locale, "subtitle")}
                      >
                        <TextInput
                          {...fieldProps}
                          value={entry.subtitle ?? ""}
                          onChange={(event) => setField("subtitle", event.target.value)}
                          maxLength={LIMITS.shortText}
                        />
                      </Field>
                      <Field label="Body" error={translationError(errors, locale, "body")}>
                        <MarkdownEditor
                          {...fieldProps}
                          value={entry.body ?? ""}
                          onChange={(body) => setField("body", body)}
                          rows={10}
                          maxLength={LIMITS.markdown}
                        />
                      </Field>
                      <Field
                        label="Button label"
                        hint="Text of the call-to-action button, e.g. “Get my full report”."
                        error={translationError(errors, locale, "cta_label")}
                      >
                        <TextInput
                          {...fieldProps}
                          value={entry.cta_label ?? ""}
                          onChange={(event) => setField("cta_label", event.target.value)}
                          maxLength={LIMITS.label}
                          className="sm:max-w-sm"
                        />
                      </Field>
                    </>
                  )}
                </TranslationTabs>
              </Panel>

              <Panel title="Image">
                <ImagePicker
                  label={<span className="sr-only">Offer image</span>}
                  value={values.image_url}
                  onChange={(url) => set("image_url", url)}
                  error={errors.image_url}
                  hint="Shown on the offers page. A wide image (16:9) works best."
                />
              </Panel>
            </div>

            <div className="min-w-0 space-y-5">
              <Panel title="Visibility">
                <div className="space-y-4">
                  <VisibilityPreview values={values} isNew={isNew} />
                  <Switch
                    label="Active"
                    description="Switch off to hide the offer without deleting it."
                    checked={values.is_active}
                    onChange={(checked) => set("is_active", checked)}
                  />
                  <Switch
                    label="Show as site banner"
                    description="A slim bar on every page while the offer is live."
                    checked={values.show_banner}
                    onChange={(checked) => set("show_banner", checked)}
                  />
                  <Field label="Starts" hint="Empty: live immediately." error={errors.starts_at}>
                    <DateTimeInput
                      value={values.starts_at}
                      onChange={(iso) => set("starts_at", iso)}
                      showZone={false}
                    />
                  </Field>
                  <Field label="Ends" hint="Empty: no end date." error={errors.ends_at}>
                    <DateTimeInput
                      value={values.ends_at}
                      onChange={(iso) => {
                        set("ends_at", iso);
                        setErrors((prev) => clearErrors(prev, "starts_at"));
                      }}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="Link & discount">
                <div className="space-y-4">
                  <Field
                    label="Button link"
                    hint="A site path such as /reading (visitors keep their language) or a full https:// address."
                    error={errors.cta_url}
                  >
                    <TextInput
                      dir="ltr"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={values.cta_url}
                      onChange={(event) => set("cta_url", event.target.value)}
                      placeholder="/reading"
                      maxLength={LIMITS.link}
                    />
                  </Field>
                  <DiscountField
                    value={values.discount_code_id}
                    onChange={(discountId) => set("discount_code_id", discountId)}
                    linkedCode={
                      offer && offer.discount_code_id === values.discount_code_id
                        ? offer.discount_code
                        : null
                    }
                    error={errors.discount_code_id}
                  />
                </div>
              </Panel>

              <Panel title="Settings">
                <div className="space-y-4">
                  <Field
                    label="Slug"
                    required
                    error={errors.slug}
                    hint={
                      <>
                        Address of the offer page:{" "}
                        <span className="font-mono break-all" dir="ltr">
                          /offers/{values.slug || "…"}
                        </span>
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
                      maxLength={LIMITS.slug}
                      className="font-mono text-[0.8125rem]"
                    />
                  </Field>
                  <Field
                    label="Sort order"
                    hint="Lower numbers come first."
                    error={errors.sort_order}
                  >
                    <TextInput
                      inputMode="numeric"
                      dir="ltr"
                      value={values.sort_order}
                      onChange={(event) => set("sort_order", event.target.value)}
                      className="max-w-28 tabular-nums"
                    />
                  </Field>
                  {offer ? (
                    <p className="text-xs text-ink-soft">
                      Created {formatDateTime(offer.created_at)} · updated{" "}
                      {formatDateTime(offer.updated_at)}
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
        saving={save.pending}
        formId={FORM_ID}
        saveLabel={isNew ? "Create offer" : "Save changes"}
        status={isNew ? "New offer · not saved yet" : "Unsaved changes"}
        cleanStatus={isNew ? "New offer" : "All changes saved"}
        onDiscard={
          isNew
            ? undefined
            : () => {
                setForm((prev) => (prev ? { ...prev, values: prev.initial } : prev));
                setErrors({});
              }
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutateAsync()}
        tone="danger"
        title="Delete this offer?"
        description="It disappears from the site at once. The linked discount code is kept."
        confirmLabel="Delete offer"
      />
    </>
  );
}
