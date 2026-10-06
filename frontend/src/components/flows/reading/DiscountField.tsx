"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Field, Input } from "@/components/ui/form";
import { useApiErrorMessage } from "@/lib/api/useApiErrorMessage";
import type { DiscountState } from "@/lib/flows/discount";
import { formatMoney } from "@/lib/format";
import { bidiIsolate } from "@/lib/flows/text";

export interface DiscountFieldProps {
  open: boolean;
  onOpen: () => void;
  value: string;
  state: DiscountState;
  /** Code prefilled from `?code=` (offer links). */
  fromLink: string | null;
  disabled?: boolean;
  /** Client-side validation issue (too long). */
  issue?: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
}

/** Collapsible discount-code input with Apply / Remove and reason-specific messages. */
export function DiscountField({
  open,
  onOpen,
  value,
  state,
  fromLink,
  disabled = false,
  issue,
  onChange,
  onApply,
  onRemove,
}: DiscountFieldProps) {
  const t = useTranslations("reading.discount");
  const tForm = useTranslations("form");
  const tErrors = useTranslations("errors");
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale();
  const statusId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        disabled={disabled}
        className="inline-flex items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline"
      >
        <TagIcon />
        {t("toggle")}
      </button>
    );
  }

  const error =
    issue ??
    (state.status === "error"
      ? state.reason
        ? tErrors(`discount.${state.reason}`)
        : apiErrorMessage(state.error)
      : undefined);
  const applied = state.status === "applied";
  const checking = state.status === "checking";

  return (
    <div>
      <Field
        label={tForm("labels.discountCode")}
        optionalLabel={tForm("optional")}
        error={error}
        hint={fromLink && !error && !applied ? t("fromLink", { code: fromLink }) : undefined}
      >
        <div className="flex gap-2">
          <Input
            name="discountCode"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            dir="ltr"
            className="min-w-0 flex-1 font-semibold tracking-[0.08em] uppercase placeholder:font-normal placeholder:tracking-normal placeholder:normal-case rtl:text-end"
            placeholder={tForm("placeholders.discountCode")}
            value={value}
            disabled={disabled || checking}
            aria-describedby={statusId}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter applies the code instead of submitting the whole order.
              if (e.key === "Enter") {
                e.preventDefault();
                if (value.trim() && !applied) onApply();
              }
            }}
          />
          {applied ? (
            <Button
              variant="outline"
              className="h-12 shrink-0 px-5"
              onClick={onRemove}
              disabled={disabled}
            >
              {tForm("remove")}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-12 shrink-0 px-5"
              onClick={onApply}
              loading={checking}
              disabled={disabled || !value.trim()}
            >
              {tForm("apply")}
            </Button>
          )}
        </div>
      </Field>
      <p id={statusId} role="status" className="mt-2 min-h-5 text-sm">
        {checking ? (
          <span className="inline-flex items-center gap-2 text-muted">
            <Spinner size="sm" /> {t("checking")}
          </span>
        ) : applied ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <CheckIcon />
            {t("applied", {
              code: state.code,
              amount: bidiIsolate(
                formatMoney(state.quote.discount_cents, state.quote.currency, locale),
              ),
            })}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function TagIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4 shrink-0"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 10.6V4a1 1 0 0 1 1-1h6.6a1 1 0 0 1 .7.3l5.4 5.4a1 1 0 0 1 0 1.4l-6.6 6.6a1 1 0 0 1-1.4 0l-5.4-5.4a1 1 0 0 1-.3-.7Z" />
      <circle cx="7" cy="7" r="1.2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4 shrink-0"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}
