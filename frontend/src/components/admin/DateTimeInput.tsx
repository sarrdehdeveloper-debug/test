"use client";

import { useState, type ComponentPropsWithRef } from "react";
import {
  formatDateTime,
  isoToLocalInput,
  localInputToIso,
  localTimeZone,
} from "@/lib/admin/format";
import { cn } from "@/lib/cn";
import { useFieldControl } from "@/components/ui/form/Field";
import { adminControlClasses } from "./form";

export interface DateTimeInputProps extends Omit<
  ComponentPropsWithRef<"input">,
  "value" | "onChange" | "type" | "defaultValue"
> {
  /** ISO-8601 UTC string, or null when empty. */
  value: string | null;
  /** Receives an ISO UTC string (`…Z`), or null when the field is cleared. */
  onChange: (iso: string | null) => void;
  /** Show "Your time zone: Europe/Berlin · 6 Oct 2026, 14:05 UTC" under the field (default true). */
  showZone?: boolean;
}

/**
 * Date + time in the admin's local time zone, stored as ISO UTC (offers/discounts `starts_at`,
 * `ends_at`, blog `published_at`). Wrap in <Field label=…>.
 *   <DateTimeInput value={form.starts_at} onChange={(iso) => set("starts_at", iso)} />
 */
export function DateTimeInput({
  value,
  onChange,
  showZone = true,
  className,
  ...props
}: DateTimeInputProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  // Keep what the user typed while it is incomplete; follow external value changes.
  const [draft, setDraft] = useState(() => isoToLocalInput(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(isoToLocalInput(value));
  }

  return (
    <div className="min-w-0">
      <input
        {...props}
        {...field}
        type="datetime-local"
        dir="ltr"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const iso = localInputToIso(next);
          if (iso !== undefined && iso !== value) {
            setSynced(iso);
            onChange(iso);
          }
        }}
        className={cn(adminControlClasses, "h-10 max-w-64", className)}
      />
      {showZone ? (
        <p className="mt-1 text-xs text-ink-soft">
          Your time zone: {localTimeZone()}
          {value ? <> · {formatDateTime(value, { timeZone: "UTC" })} UTC</> : null}
        </p>
      ) : null}
    </div>
  );
}
