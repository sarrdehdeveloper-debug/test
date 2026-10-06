"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { Field, FieldError, useFieldControl } from "@/components/ui/form/Field";
import { cn } from "@/lib/cn";

/**
 * Dense form controls of the dashboard. Wrap each control in `<Field label error hint required>`
 * (re-exported from the site's form kit): ids, aria-describedby and aria-invalid are wired for you.
 *
 *   <Field label="Slug" error={errors.slug} hint="Lower-case letters, digits and -" required>
 *     <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" />
 *   </Field>
 *
 * Arabic content fields: pass `lang="ar" dir="rtl"` (or put them inside <TranslationTabs>, which
 * sets both on the panel) — admin.css switches to the Arabic fonts.
 */
export { Field, FieldError };

export const adminControlClasses =
  "block w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink shadow-xs " +
  "placeholder:text-stone-400 transition-[border-color,box-shadow] duration-150 hover:border-stone-400 " +
  "focus:border-gold-bright focus:outline-none focus:ring-3 focus:ring-gold-light/40 " +
  "disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 read-only:bg-stone-50 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export type TextInputProps = ComponentPropsWithRef<"input"> & {
  /** Content inside the field on the start side (e.g. a currency symbol or icon). */
  startAdornment?: ReactNode;
  /** Content inside the field on the end side (e.g. "%" or a unit). */
  endAdornment?: ReactNode;
};

export function TextInput({ className, startAdornment, endAdornment, ...props }: TextInputProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  const input = (
    <input
      {...props}
      {...field}
      className={cn(
        adminControlClasses,
        "h-10",
        startAdornment ? "ps-9" : null,
        endAdornment ? "pe-10" : null,
        className,
      )}
    />
  );
  if (!startAdornment && !endAdornment) return input;
  return (
    <div className="relative">
      {startAdornment ? (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center text-sm text-stone-500">
          {startAdornment}
        </span>
      ) : null}
      {input}
      {endAdornment ? (
        <span className="pointer-events-none absolute inset-y-0 end-0 flex w-10 items-center justify-center text-sm text-stone-500">
          {endAdornment}
        </span>
      ) : null}
    </div>
  );
}

export type TextAreaProps = ComponentPropsWithRef<"textarea">;

export function TextArea({ className, rows = 4, ...props }: TextAreaProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  return (
    <textarea
      rows={rows}
      {...props}
      {...field}
      className={cn(adminControlClasses, "py-2 leading-relaxed", className)}
    />
  );
}

export interface SelectInputProps extends ComponentPropsWithRef<"select"> {
  /** First, empty option (e.g. "All statuses"). */
  placeholder?: string;
}

export function SelectInput({ className, placeholder, children, ...props }: SelectInputProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        {...field}
        className={cn(adminControlClasses, "h-10 appearance-none pe-9", className)}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {children}
      </select>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-stone-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5.5 8 4.5 4.5L14.5 8" />
      </svg>
    </div>
  );
}

export interface SwitchProps extends Omit<
  ComponentPropsWithRef<"button">,
  "onChange" | "value" | "children"
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label (also the accessible name). */
  label: ReactNode;
  /** Smaller text under the label. */
  description?: ReactNode;
}

/** On/off toggle (`role="switch"`), e.g. "Published", "Show as banner". */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  id,
  ...props
}: SwitchProps) {
  const auto = useId();
  const switchId = id ?? `sw${auto.replace(/:/g, "")}`;
  const descriptionId = description ? `${switchId}-desc` : undefined;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <button
        {...props}
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5.5 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-gold bg-gold-bright" : "border-stone-300 bg-stone-200",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-150",
            checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5",
          )}
        />
      </button>
      <span className="min-w-0">
        <label htmlFor={switchId} className="block cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs text-ink-soft">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export interface CheckboxInputProps extends Omit<ComponentPropsWithRef<"input">, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export function CheckboxInput({ label, description, id, className, ...props }: CheckboxInputProps) {
  const auto = useId();
  const inputId = id ?? `cb${auto.replace(/:/g, "")}`;
  const descriptionId = description ? `${inputId}-desc` : undefined;
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        {...props}
        id={inputId}
        type="checkbox"
        aria-describedby={descriptionId}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-stone-300 accent-gold-bright"
      />
      <span className="min-w-0">
        <label htmlFor={inputId} className="block cursor-pointer text-sm text-ink">
          {label}
        </label>
        {description ? (
          <span id={descriptionId} className="block text-xs text-ink-soft">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}
