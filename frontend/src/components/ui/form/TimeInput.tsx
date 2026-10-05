"use client";

import { cn } from "@/lib/cn";
import { Input, type InputProps } from "./Input";

export type TimeInputProps = Omit<InputProps, "type">;

/** Native time picker; value is `HH:MM` (24 h) whatever the display format. */
export function TimeInput({ className, step = 60, ...props }: TimeInputProps) {
  return (
    <Input
      type="time"
      step={step}
      dir="ltr"
      className={cn("text-start rtl:text-end tabular-nums", className)}
      {...props}
    />
  );
}
