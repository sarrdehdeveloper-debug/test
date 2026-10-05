"use client";

import { cn } from "@/lib/cn";
import { Input, type InputProps } from "./Input";

export interface DateInputProps extends Omit<InputProps, "type"> {
  /** `YYYY-MM-DD` bounds, e.g. min={config.min_birth_date} max={today}. */
  min?: string;
  max?: string;
}

/**
 * Native date picker (value is always `YYYY-MM-DD`, displayed in the browser's locale format).
 * Digits stay left-to-right in RTL pages.
 */
export function DateInput({ className, ...props }: DateInputProps) {
  return (
    <Input
      type="date"
      inputMode="numeric"
      dir="ltr"
      className={cn("text-start rtl:text-end tabular-nums", className)}
      {...props}
    />
  );
}

/** Today's date as `YYYY-MM-DD` in the visitor's time zone (call in an effect or event handler). */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
