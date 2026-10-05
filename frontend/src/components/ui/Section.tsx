import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { StarField } from "@/components/decor/StarField";
import { cn } from "@/lib/cn";
import { Container } from "./Container";

export type Tone = "ivory" | "parchment" | "night";

const TONES: Record<Tone, string> = {
  ivory: "bg-ivory",
  parchment: "bg-parchment",
  night: "bg-night-sky",
};

const SPACING = {
  none: "",
  sm: "py-10 sm:py-14",
  md: "py-16 sm:py-20 lg:py-24",
  lg: "py-20 sm:py-28 lg:py-32",
} as const;

export interface SectionProps extends Omit<ComponentPropsWithoutRef<"section">, "children"> {
  /** Surface colour; sets `data-tone` so nested components pick readable colours. */
  tone?: Tone;
  spacing?: keyof typeof SPACING;
  /** Wrap children in a <Container> (default true). */
  contained?: boolean;
  containerSize?: "narrow" | "default" | "wide";
  /** Twinkling star field behind the content (night tone). */
  stars?: boolean;
  children: ReactNode;
}

/** Full-bleed page band. Give it `aria-labelledby` pointing at its heading id. */
export function Section({
  tone = "ivory",
  spacing = "md",
  contained = true,
  containerSize = "default",
  stars = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      data-tone={tone}
      className={cn("relative isolate overflow-hidden", TONES[tone], SPACING[spacing], className)}
      {...props}
    >
      {stars ? <StarField className="-z-10" /> : null}
      {contained ? <Container size={containerSize}>{children}</Container> : children}
    </section>
  );
}
