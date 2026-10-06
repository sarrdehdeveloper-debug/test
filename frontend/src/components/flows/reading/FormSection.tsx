import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Numbered group of the order form (role=group labelled by its heading). */
export function FormSection({
  id,
  index,
  title,
  children,
  className,
}: {
  id: string;
  index: number;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" aria-labelledby={id} className={cn("space-y-5", className)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-gold/45 bg-ivory font-display text-sm font-semibold text-gold-deep"
        >
          {index}
        </span>
        <h3 id={id} className="font-serif text-2xl leading-tight font-semibold text-fg">
          {title}
        </h3>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>
      {children}
    </div>
  );
}
