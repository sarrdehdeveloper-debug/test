import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FormSectionProps {
  /** Section heading (h2). */
  title: ReactNode;
  /** Explanation shown beside (desktop) or above (mobile) the fields. */
  description?: ReactNode;
  children: ReactNode;
  /** Buttons at the bottom of the card (e.g. Save). */
  footer?: ReactNode;
  /** `aside` (default): description column on the start side from lg up; `stacked`: header on top. */
  layout?: "aside" | "stacked";
  id?: string;
  className?: string;
}

/**
 * Group of related form fields in a white card, settings-page style.
 *   <FormSection title="Password" description="At least 12 characters." footer={<AdminButton type="submit">Save</AdminButton>}>
 *     <Field label="Current password"><TextInput type="password" … /></Field>
 *   </FormSection>
 */
export function FormSection({
  title,
  description,
  children,
  footer,
  layout = "aside",
  id,
  className,
}: FormSectionProps) {
  const headingId = id ? `${id}-title` : undefined;
  const aside = layout === "aside";
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        aside && "grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]",
        className,
      )}
    >
      <div className={cn(!aside && "mb-3")}>
        <h2 id={headingId} className="text-[0.95rem] font-semibold text-ink">
          {title}
        </h2>
        {description ? (
          <div className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">{description}</div>
        ) : null}
      </div>
      <div className="min-w-0 rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgb(31_36_48/0.04)]">
        <div className="space-y-4 p-4 sm:p-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-stone-200/80 bg-stone-50/60 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </section>
  );
}
