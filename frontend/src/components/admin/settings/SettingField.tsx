"use client";

import { useId, useState } from "react";
import { Field, Switch, TextInput } from "@/components/admin/form";
import { MoneyInput } from "@/components/admin/MoneyInput";
import { Badge } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/cn";
import {
  formatSettingValue,
  type SettingField as SettingFieldDef,
  type SettingsDraft,
} from "./schema";

type DraftValue = SettingsDraft[keyof SettingsDraft];

export interface SettingFieldProps {
  field: SettingFieldDef;
  value: DraftValue;
  /** Backend default (`GET /settings` → defaults). */
  defaultValue: unknown;
  /** Value as a draft entry, to compare for the "Reset to default" button. */
  defaultDraft: DraftValue;
  /** The draft differs from the saved value. */
  changed: boolean;
  error?: string;
  /** Currency for money fields. */
  currency: string;
  onChange: (value: DraftValue) => void;
  disabled?: boolean;
  className?: string;
}

function Hint({
  field,
  defaultValue,
  currency,
  showReset,
  onReset,
}: {
  field: SettingFieldDef;
  defaultValue: unknown;
  currency: string;
  showReset: boolean;
  onReset: () => void;
}) {
  return (
    <>
      {field.help}{" "}
      <span className="whitespace-nowrap text-stone-500">
        Default:{" "}
        <span className="font-medium text-ink-soft">
          {formatSettingValue(field, defaultValue, currency)}
        </span>
      </span>
      {showReset ? (
        <>
          {" · "}
          <button
            type="button"
            onClick={onReset}
            className="rounded font-medium whitespace-nowrap text-gold-deep underline-offset-2 hover:underline"
          >
            Reset to default
          </button>
        </>
      ) : null}
    </>
  );
}

function Label({ text, changed }: { text: string; changed: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {text}
      {changed ? (
        <Badge tone="warning" className="font-medium">
          Changed
        </Badge>
      ) : null}
    </span>
  );
}

/** One business setting: the right control for its kind, help text, default and reset. */
export function SettingField({
  field,
  value,
  defaultValue,
  defaultDraft,
  changed,
  error,
  currency,
  onChange,
  disabled = false,
  className,
}: SettingFieldProps) {
  const groupId = useId();
  const [moneyInvalid, setMoneyInvalid] = useState(false);
  const atDefault =
    field.kind === "decimal" || field.kind === "integer"
      ? Number(value) === Number(defaultDraft) && String(value).trim() !== ""
      : value === defaultDraft;
  const hint = (
    <Hint
      field={field}
      defaultValue={defaultValue}
      currency={currency}
      showReset={!atDefault && !disabled}
      onReset={() => onChange(defaultDraft)}
    />
  );

  if (field.kind === "boolean") {
    return (
      <div className={cn("rounded-lg border border-stone-200 bg-stone-50/50 p-3.5", className)}>
        <Switch
          checked={Boolean(value)}
          onChange={(checked) => onChange(checked)}
          disabled={disabled}
          label={<Label text={field.label} changed={changed} />}
          description={hint}
        />
      </div>
    );
  }

  if (field.kind === "choice") {
    return (
      <fieldset className={cn("min-w-0", className)} aria-describedby={`${groupId}-hint`}>
        <legend className="mb-2 text-sm font-semibold text-ink">
          <Label text={field.label} changed={changed} />
        </legend>
        <div className="grid gap-2.5 md:grid-cols-2">
          {field.options?.map((option) => {
            const checked = value === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "relative flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-[border-color,background-color,box-shadow]",
                  checked
                    ? "border-gold-bright bg-gold-pale/30 shadow-[0_0_0_1px_var(--color-gold-bright)]"
                    : "border-stone-200 bg-white hover:border-stone-300",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name={`${groupId}-${field.key}`}
                  value={option.value}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onChange(option.value)}
                  className="mt-0.5 size-4 shrink-0 accent-gold-bright"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  <span className="mt-1 block text-[0.8125rem] leading-relaxed text-ink-soft">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p id={`${groupId}-hint`} className="mt-2 text-xs leading-relaxed text-ink-soft">
          {hint}
        </p>
        {error ? <p className="mt-1 text-sm font-medium text-danger">{error}</p> : null}
      </fieldset>
    );
  }

  const label = <Label text={field.label} changed={changed} />;

  if (field.kind === "money") {
    return (
      <Field
        label={label}
        hint={hint}
        error={error ?? (moneyInvalid ? "Enter an amount like 29.00." : undefined)}
        className={className}
      >
        <MoneyInput
          value={typeof value === "number" ? value : null}
          currency={currency}
          disabled={disabled}
          onValidityChange={(valid) => setMoneyInvalid(!valid)}
          onChange={(cents) => onChange(cents)}
        />
      </Field>
    );
  }

  const numeric = field.kind === "integer" || field.kind === "decimal";
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <div className="flex items-center gap-2.5">
        <div className={field.kind === "currency" ? "w-24" : numeric ? "w-36" : "w-full max-w-80"}>
          <TextInput
            type={numeric ? "number" : "text"}
            inputMode={
              field.kind === "integer"
                ? "numeric"
                : field.kind === "decimal"
                  ? "decimal"
                  : undefined
            }
            min={field.min}
            max={field.max}
            step={
              field.kind === "decimal"
                ? (field.step ?? "any")
                : field.kind === "integer"
                  ? 1
                  : undefined
            }
            maxLength={field.kind === "currency" ? 3 : field.kind === "text" ? 100 : undefined}
            value={String(value ?? "")}
            disabled={disabled}
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) =>
              onChange(
                field.kind === "currency" ? event.target.value.toUpperCase() : event.target.value,
              )
            }
            className={cn(
              numeric && "tabular-nums",
              field.kind === "currency" && "font-mono uppercase",
            )}
          />
        </div>
        {field.unit ? <span className="text-sm text-ink-soft">{field.unit}</span> : null}
      </div>
    </Field>
  );
}
