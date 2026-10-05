import { cn } from "@/lib/cn";
import type { WesternSign } from "@/lib/types";
import { SIGN_GLYPHS } from "./data";

const SIZES = {
  sm: "size-9 text-lg",
  md: "size-12 text-2xl",
  lg: "size-16 text-[2rem]",
  xl: "size-24 text-5xl",
} as const;

export interface GlyphBadgeProps {
  size?: keyof typeof SIZES;
  /** Accessible name (e.g. the translated sign). Omit when a visible label sits next to the icon. */
  label?: string;
  /** Plain glyph without the ringed badge. */
  bare?: boolean;
  className?: string;
}

export function GlyphBadge({
  glyph,
  size = "md",
  label,
  bare = false,
  className,
  fontClass,
}: GlyphBadgeProps & { glyph: string; fontClass: string }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <span
      {...a11y}
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none select-none",
        fontClass,
        bare
          ? "text-ornament"
          : "rounded-full border border-current/40 text-ornament ring-1 ring-current/15 ring-offset-2 ring-offset-transparent [background:radial-gradient(circle_at_30%_25%,rgb(233_199_123/0.22),transparent_70%)]",
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true">{glyph}</span>
    </span>
  );
}

/** Western zodiac sign glyph (♈︎ … ♓︎) in a gold ring. */
export function SignIcon({ sign, ...props }: GlyphBadgeProps & { sign: WesternSign }) {
  return <GlyphBadge glyph={SIGN_GLYPHS[sign]} fontClass="font-[family-name:var(--font-symbol)]" {...props} />;
}
