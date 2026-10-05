"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FieldError } from "./Field";

export interface CheckboxProps extends Omit<ComponentPropsWithRef<"input">, "type"> {
  /** Label content; may contain links (e.g. t.rich for "I accept the <terms>Terms</terms>"). */
  label: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
}

/** Checkbox with its label on the inline-end side, plus optional hint and error. */
export function Checkbox({ label, error, hint, id, className, ...props }: CheckboxProps) {
  const auto = useId();
  const inputId = id ?? `c${auto.replace(/:/g, "")}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [props["aria-describedby"], errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-start gap-3">
        <input
          {...props}
          id={inputId}
          type="checkbox"
          aria-describedby={describedBy}
          aria-invalid={error ? true : props["aria-invalid"]}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-gold/50 accent-gold-bright focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <label htmlFor={inputId} className="cursor-pointer text-sm leading-relaxed text-fg [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">
          {label}
        </label>
      </div>
      {hint ? (
        <p id={hintId} className="ps-8 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <div className="ps-8">
          <FieldError id={errorId}>{error}</FieldError>
        </div>
      ) : null}
    </div>
  );
}
