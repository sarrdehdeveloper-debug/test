import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/cn";

const SIZES = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
} as const;

type ContainerProps<T extends ElementType> = {
  as?: T;
  size?: keyof typeof SIZES;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/** Centered page column with the site's horizontal gutters (16px on phones). */
export function Container<T extends ElementType = "div">({
  as,
  size = "default",
  className,
  ...props
}: ContainerProps<T>) {
  const Tag: ElementType = as ?? "div";
  return <Tag className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", SIZES[size], className)} {...props} />;
}
