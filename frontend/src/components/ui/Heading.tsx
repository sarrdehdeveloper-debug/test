import type { ReactNode } from "react";
import { Ornament } from "@/components/decor/Ornament";
import { cn } from "@/lib/cn";

const SIZES = {
  xl: "text-4xl sm:text-5xl lg:text-6xl",
  lg: "text-3xl sm:text-4xl lg:text-5xl",
  md: "text-2xl sm:text-3xl",
  sm: "text-xl sm:text-2xl",
} as const;

export interface HeadingProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Intro paragraph under the title. */
  lead?: ReactNode;
  as?: "h1" | "h2" | "h3";
  size?: keyof typeof SIZES;
  /** "responsive" = centered on small screens, start-aligned from lg. */
  align?: "center" | "start" | "responsive";
  /** Gold flourish between title and lead (default true). */
  ornament?: boolean;
  /** Put on the <h*> so the parent <Section aria-labelledby> can reference it. */
  id?: string;
  className?: string;
}

/** Section heading: eyebrow (small caps) + serif title + gold flourish + lead. */
export function Heading({
  title,
  eyebrow,
  lead,
  as: Tag = "h2",
  size = "lg",
  align = "center",
  ornament = true,
  id,
  className,
}: HeadingProps) {
  const centered = align === "center";
  const responsive = align === "responsive";
  const wrapper = centered
    ? "mx-auto max-w-3xl text-center"
    : responsive
      ? "mx-auto max-w-3xl text-center lg:mx-0 lg:text-start"
      : "max-w-3xl text-start";
  const block = centered ? "mx-auto" : responsive ? "mx-auto lg:mx-0" : "";
  return (
    <header className={cn(wrapper, className)}>
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <Tag id={id} className={cn("font-serif leading-[1.1] font-semibold text-fg", SIZES[size])}>
        {title}
      </Tag>
      {ornament ? <Ornament className={cn("mt-5 h-4 w-40 text-ornament", block)} /> : null}
      {lead ? <p className={cn("mt-5 max-w-2xl text-lg text-muted", block)}>{lead}</p> : null}
    </header>
  );
}
