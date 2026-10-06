import Image from "next/image";
import { cn } from "@/lib/cn";

export interface AdminLogoProps {
  /** `sidebar` (on navy) or `light` (on ivory/white, e.g. the login card). */
  tone?: "sidebar" | "light";
  /** Show the small "Admin" caption under the wordmark (default true). */
  caption?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Emblem + "ZODIAC BLEND" wordmark + "Admin" caption. Decorative: label the parent link. */
export function AdminLogo({
  tone = "sidebar",
  caption = true,
  size = "md",
  className,
}: AdminLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/brand/emblem-128.png"
        alt=""
        width={128}
        height={128}
        priority
        className={cn(
          "shrink-0 drop-shadow-[0_0_10px_rgb(199_137_51/0.35)]",
          size === "sm" ? "size-8" : "size-10",
        )}
      />
      <span className="flex flex-col items-start leading-none">
        <span
          className={cn(
            "font-display font-semibold tracking-[0.12em]",
            size === "sm" ? "text-[0.9rem]" : "text-[1.02rem]",
            tone === "sidebar" ? "text-gold-gradient" : "text-gold-deep",
          )}
        >
          ZODIAC BLEND
        </span>
        {caption ? (
          <span
            className={cn(
              "mt-1 font-display text-[0.62rem] font-semibold tracking-[0.32em] uppercase",
              tone === "sidebar" ? "text-mist/70" : "text-ink-soft",
            )}
          >
            Admin
          </span>
        ) : null}
      </span>
    </span>
  );
}
