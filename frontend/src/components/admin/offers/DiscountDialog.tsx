"use client";

import { useId, useState, type FormEvent } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { DateTimeInput } from "@/components/admin/DateTimeInput";
import { Field, Switch, TextInput } from "@/components/admin/form";
import { Icon } from "@/components/admin/icons";
import { Modal } from "@/components/admin/Modal";
import { MoneyInput } from "@/components/admin/MoneyInput";
import { FormErrorAlert } from "@/components/admin/content/FormErrorAlert";
import { clearErrors } from "@/components/admin/content/forms";
import { refreshPublicSite } from "@/components/admin/content/publicRefresh";
import { adminApi } from "@/lib/admin/api";
import { adminErrorMessage, adminFieldErrors } from "@/lib/admin/errors";
import { useAdminMutation } from "@/lib/admin/hooks";
import type { Discount, DiscountCreate, DiscountKind, DiscountUpdate } from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";
import { cn } from "@/lib/cn";
import {
  discountPatch,
  discountPayload,
  discountToForm,
  normalizeCode,
  validateDiscount,
  type DiscountFormValues,
} from "./discountForm";

const KINDS: Array<{ value: DiscountKind; label: string; hint: string }> = [
  { value: "percent", label: "Percentage", hint: "e.g. 10% off" },
  { value: "fixed", label: "Fixed amount", hint: "e.g. $5 off" },
];

function KindPicker({
  value,
  onChange,
}: {
  value: DiscountKind;
  onChange: (kind: DiscountKind) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-ink">Type</legend>
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((kind) => {
          const checked = kind.value === value;
          return (
            <label
              key={kind.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold-light/50",
                checked
                  ? "border-gold-bright bg-gold-pale/40"
                  : "border-stone-200 bg-white hover:border-stone-300",
              )}
            >
              <input
                type="radio"
                name={name}
                value={kind.value}
                checked={checked}
                onChange={() => onChange(kind.value)}
                className="mt-0.5 size-4 accent-gold-bright"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{kind.label}</span>
                <span className="block text-xs text-ink-soft">{kind.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface DiscountDialogProps {
  open: boolean;
  /** The code being edited, or null to create one. */
  discount: Discount | null;
  /** Currency of the shop (public-config), default for fixed discounts. */
  defaultCurrency: string;
  onClose: () => void;
  onSaved: (discount: Discount, created: boolean) => void;
}

function DiscountForm({
  discount,
  defaultCurrency,
  onClose,
  onSaved,
  onPendingChange,
}: Omit<DiscountDialogProps, "open"> & { onPendingChange: (pending: boolean) => void }) {
  const formId = useId();
  const [initial] = useState(() => discountToForm(discount, defaultCurrency));
  const [values, setValues] = useState<DiscountFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const save = useAdminMutation(
    (body: { create?: DiscountCreate; patch?: DiscountUpdate }) =>
      body.create
        ? adminApi.post<Discount>("/discounts", body.create)
        : adminApi.patch<Discount>(`/discounts/${discount!.id}`, body.patch),
    {
      // Errors are shown inside the dialog (toasts sit behind its backdrop).
      errorMessage: false,
      successMessage: (saved, body) =>
        body.create ? `Discount ${saved.code} created` : `Discount ${saved.code} saved`,
      onError: (error) => {
        const fields = adminFieldErrors(error);
        if (error.code === "code_taken") fields.code = "Another discount already uses this code.";
        setErrors(fields);
        setFormError(Object.keys(fields).length ? null : adminErrorMessage(error));
        onPendingChange(false);
      },
      onSuccess: (saved, body) => {
        onPendingChange(false);
        refreshPublicSite(CACHE_TAGS.offers);
        onSaved(saved, Boolean(body.create));
      },
    },
  );

  const set = <K extends keyof DiscountFormValues>(field: K, value: DiscountFormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    const errorKey = field === "percent" || field === "amount_cents" ? "value" : field;
    setErrors((prev) => clearErrors(prev, errorKey));
    setFormError(null);
  };

  const patch = discount ? discountPatch(initial, values) : null;
  const dirty = discount ? Object.keys(patch ?? {}).length > 0 : true;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (save.pending) return;
    const found = validateDiscount(values);
    setErrors(found);
    setFormError(null);
    setSubmitted(true);
    if (Object.keys(found).length) return;
    if (discount && !dirty) {
      onClose();
      return;
    }
    onPendingChange(true);
    void save.mutate(discount ? { patch: patch! } : { create: discountPayload(values) });
  };

  const fixed = values.kind === "fixed";
  return (
    <>
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        <FormErrorAlert
          message={formError}
          errors={submitted ? errors : undefined}
          labels={{ value: "Discount", max_redemptions: "Maximum uses", ends_at: "Ends" }}
        />
        {discount && discount.redemptions_count > 0 ? (
          <p className="flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2 text-[0.8125rem] text-ink-soft ring-1 ring-stone-200 ring-inset">
            <Icon name="info" className="mt-px size-4 text-stone-500" />
            Used {discount.redemptions_count} {discount.redemptions_count === 1 ? "time" : "times"}.
            Changes apply to future orders only.
          </p>
        ) : null}
        <fieldset disabled={save.pending} className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" required error={errors.code} hint="Letters, digits, - and _.">
              <TextInput
                value={values.code}
                onChange={(event) => set("code", normalizeCode(event.target.value))}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                placeholder="SPRING10"
                className="font-mono tracking-wide uppercase"
              />
            </Field>
            <Field label="Status">
              <div className="flex h-10 items-center">
                <Switch
                  label="Active"
                  checked={values.is_active}
                  onChange={(checked) => set("is_active", checked)}
                />
              </div>
            </Field>
          </div>
          <Field
            label="Description"
            error={errors.description}
            hint="Internal note, e.g. which campaign uses it."
          >
            <TextInput
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              maxLength={300}
            />
          </Field>
          <KindPicker
            value={values.kind}
            onChange={(kind) => {
              set("kind", kind);
              setErrors((prev) => clearErrors(prev, "value", "currency"));
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {fixed ? (
              <>
                <Field label="Amount off" required error={errors.value}>
                  <MoneyInput
                    value={values.amount_cents}
                    onChange={(cents) => set("amount_cents", cents)}
                    currency={
                      /^[A-Za-z]{3}$/.test(values.currency) ? values.currency.toUpperCase() : "USD"
                    }
                  />
                </Field>
                <Field
                  label="Currency"
                  required
                  error={errors.currency}
                  hint="Must match the shop currency to apply."
                >
                  <TextInput
                    value={values.currency}
                    onChange={(event) =>
                      set("currency", event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
                    }
                    maxLength={3}
                    dir="ltr"
                    className="max-w-24 font-mono uppercase"
                  />
                </Field>
              </>
            ) : (
              <Field label="Percentage off" required error={errors.value} hint="1 to 100.">
                <div className="max-w-32">
                  <TextInput
                    inputMode="numeric"
                    dir="ltr"
                    value={values.percent}
                    onChange={(event) => set("percent", event.target.value.replace(/[^\d]/g, ""))}
                    endAdornment="%"
                    maxLength={3}
                    className="tabular-nums"
                  />
                </div>
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" hint="Empty: usable now." error={errors.starts_at}>
              <DateTimeInput
                value={values.starts_at}
                onChange={(iso) => set("starts_at", iso)}
                showZone={false}
              />
            </Field>
            <Field label="Ends" hint="Empty: no end date." error={errors.ends_at}>
              <DateTimeInput
                value={values.ends_at}
                onChange={(iso) => set("ends_at", iso)}
                showZone={false}
              />
            </Field>
          </div>
          <Field
            label="Maximum uses"
            error={errors.max_redemptions}
            hint="Total paid orders that may use the code. Empty: unlimited."
          >
            <TextInput
              inputMode="numeric"
              dir="ltr"
              value={values.max_redemptions}
              onChange={(event) => set("max_redemptions", event.target.value.replace(/[^\d]/g, ""))}
              placeholder="Unlimited"
              className="max-w-40 tabular-nums"
            />
          </Field>
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
          {discount ? "Save changes" : "Create discount"}
        </AdminButton>
      </div>
    </>
  );
}

/** Create / edit a discount code in a modal (errors shown inline). */
export function DiscountDialog({
  open,
  discount,
  defaultCurrency,
  onClose,
  onSaved,
}: DiscountDialogProps) {
  const [pending, setPending] = useState(false);
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissible={!pending}
      size="lg"
      title={discount ? `Edit ${discount.code}` : "New discount code"}
      description={
        discount
          ? "Changes apply to orders placed from now on."
          : "Customers enter the code on the order form. Codes are not case-sensitive."
      }
    >
      {open ? (
        <DiscountForm
          key={discount?.id ?? "new"}
          discount={discount}
          defaultCurrency={defaultCurrency}
          onClose={onClose}
          onSaved={onSaved}
          onPendingChange={setPending}
        />
      ) : null}
    </Modal>
  );
}
