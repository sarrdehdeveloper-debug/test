"use client";

import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Props a control inside <Field> should apply (id, aria-describedby, aria-invalid, required). */
export function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  required?: boolean;
}) {
  const field = useContext(FieldContext);
  const describedBy =
    [props["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined;
  const invalid = props["aria-invalid"] ?? (field?.invalid ? true : undefined);
  return {
    id: props.id ?? field?.id,
    "aria-describedby": describedBy,
    "aria-invalid": invalid,
    required: props.required ?? field?.required ?? undefined,
    invalid:
      invalid === true || invalid === "true" || invalid === "grammar" || invalid === "spelling",
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Error message (shown in red, linked with aria-describedby, sets aria-invalid). */
  error?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  /** Text shown next to the label of non-required fields, e.g. t("form.optional"). */
  optionalLabel?: ReactNode;
  /** Explicit id for the control; generated when omitted. */
  id?: string;
  className?: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  children: ReactNode;
}

/**
 * Label + control + hint + error, wired for accessibility. Put exactly one control inside:
 *   <Field label={t("labels.email")} error={errors.email} required>
 *     <Input type="email" name="email" autoComplete="email" />
 *   </Field>
 */
export function Field({
  label,
  error,
  hint,
  required = false,
  optionalLabel,
  id,
  className,
  hideLabel = false,
  children,
}: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f${auto.replace(/:/g, "")}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const value: FieldContextValue = {
    id: controlId,
    describedBy: [errorId, hintId].filter(Boolean).join(" ") || undefined,
    invalid: Boolean(error),
    required,
  };
  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={controlId}
          className={cn(
            "flex items-baseline justify-between gap-3 text-sm font-semibold text-fg",
            hideLabel && "sr-only",
          )}
        >
          <span>
            {label}
            {required ? (
              <span aria-hidden="true" className="ms-0.5 text-gold-deep">
                *
              </span>
            ) : null}
          </span>
          {!required && optionalLabel ? (
            <span className="text-xs font-normal text-muted">{optionalLabel}</span>
          ) : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className="text-xs leading-relaxed text-muted">
            {hint}
          </p>
        ) : null}
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>
    </FieldContext.Provider>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-danger">
      <svg
        viewBox="0 0 20 20"
        className="mt-0.5 size-4 shrink-0"
        aria-hidden="true"
        fill="currentColor"
      >
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-.9 4.2h1.8v5.6H9.1V5.7Zm.9 9a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** Shared look of text-like controls (inputs, selects, combobox). */
export const controlClasses =
  "block w-full h-12 rounded-xl border bg-white px-4 text-base text-ink shadow-[inset_0_1px_2px_rgb(31_36_48/0.06)] " +
  "placeholder:text-ink-soft/60 transition-[border-color,box-shadow] duration-150 " +
  "border-gold/35 hover:border-gold/60 " +
  "focus:border-gold-bright focus:outline-none focus:ring-3 focus:ring-gold-light/45 " +
  "disabled:cursor-not-allowed disabled:bg-parchment/60 disabled:text-ink-soft " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25";
