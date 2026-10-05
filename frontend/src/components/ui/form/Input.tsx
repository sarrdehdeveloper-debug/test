"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";
import { controlClasses, useFieldControl } from "./Field";

export type InputProps = ComponentPropsWithRef<"input">;

/** Text input. Inside <Field> it picks up id / aria-describedby / aria-invalid automatically. */
export function Input({ className, ...props }: InputProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  return <input {...props} {...field} className={cn(controlClasses, className)} />;
}

export type TextareaProps = ComponentPropsWithRef<"textarea">;

export function Textarea({ className, rows = 5, ...props }: TextareaProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  return (
    <textarea
      rows={rows}
      {...props}
      {...field}
      className={cn(controlClasses, "h-auto min-h-28 py-3 leading-relaxed", className)}
    />
  );
}
