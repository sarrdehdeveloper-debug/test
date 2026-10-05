import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/cn";

const VARIANTS = {
  /** White/ivory card with a hairline gold border. */
  default: "bg-card border border-line shadow-card",
  /** Highlighted card: gold gradient border and glow (use on night or light). */
  featured:
    "border-gold-gradient shadow-glow [background-image:linear-gradient(var(--tone-card),var(--tone-card)),linear-gradient(135deg,#e9c77b,#c78933_50%,#a46f26)]",
  /** Transparent card for night sections. */
  glass: "border border-line bg-white/[0.03] backdrop-blur-sm",
  plain: "",
} as const;

type CardProps<T extends ElementType> = {
  as?: T;
  variant?: keyof typeof VARIANTS;
  padding?: "none" | "sm" | "md" | "lg";
  /** Lift on hover (for cards that are links). */
  interactive?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

const PADDING = { none: "", sm: "p-4", md: "p-6 sm:p-7", lg: "p-7 sm:p-10" } as const;

export function Card<T extends ElementType = "div">({
  as,
  variant = "default",
  padding = "md",
  interactive = false,
  className,
  ...props
}: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        "relative rounded-2xl text-fg",
        VARIANTS[variant],
        PADDING[padding],
        interactive &&
          "transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift focus-within:shadow-lift",
        className,
      )}
      {...props}
    />
  );
}
