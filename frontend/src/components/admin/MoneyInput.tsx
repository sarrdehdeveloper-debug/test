"use client";

import { useState, type ComponentPropsWithRef } from "react";
import { centsToInput, formatMoney, parseMoneyInput } from "@/lib/admin/format";
import { cn } from "@/lib/cn";
import { TextInput } from "./form";

export interface MoneyInputProps extends Omit<
  ComponentPropsWithRef<"input">,
  "value" | "onChange" | "type" | "defaultValue"
> {
  /** Amount in minor units (cents), or null when empty. */
  value: number | null;
  /** Receives cents (integer) or null when cleared. Not called while the text is invalid. */
  onChange: (cents: number | null) => void;
  /** ISO currency shown as a suffix (default "USD"). */
  currency?: string;
  /** Called with true while the typed text cannot be parsed (to block submit). */
  onValidityChange?: (valid: boolean) => void;
}

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * Decimal amount field bound to cents: shows "29.00", emits 2900. Inside <Field>, an invalid
 * entry is flagged with aria-invalid; the hint below shows the formatted amount.
 *   <Field label="Price"><MoneyInput value={values.paid_price_cents} onChange={(c) => set("paid_price_cents", c)} currency="USD" /></Field>
 */
export function MoneyInput({
  value,
  onChange,
  currency = "USD",
  onValidityChange,
  className,
  onBlur,
  ...props
}: MoneyInputProps) {
  const [draft, setDraft] = useState(() => centsToInput(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(centsToInput(value));
  }
  const parsed = parseMoneyInput(draft);
  const invalid = parsed === undefined;
  const symbol = currencySymbol(currency);

  return (
    <div className="min-w-0 max-w-48">
      <TextInput
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        value={draft}
        aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
        startAdornment={symbol.length <= 2 ? symbol : undefined}
        endAdornment={<span className="text-xs">{currency}</span>}
        className={cn("tabular-nums", className)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const cents = parseMoneyInput(next);
          onValidityChange?.(cents !== undefined);
          if (cents !== undefined && cents !== value) {
            setSynced(cents);
            onChange(cents);
          }
        }}
        onBlur={(event) => {
          if (parsed !== undefined) setDraft(centsToInput(parsed));
          onBlur?.(event);
        }}
      />
      <p
        className={cn("mt-1 min-h-4 text-xs", invalid ? "text-danger" : "text-ink-soft")}
        aria-live="polite"
      >
        {invalid
          ? "Enter an amount like 29.00"
          : parsed !== null
            ? `= ${formatMoney(parsed, currency)} (${parsed} minor units)`
            : null}
      </p>
    </div>
  );
}
