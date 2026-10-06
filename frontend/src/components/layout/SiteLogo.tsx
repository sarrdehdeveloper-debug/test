import Image from "next/image";
import { cn } from "@/lib/cn";

export interface SiteLogoProps {
  /** Show the slogan under the wordmark (from sm up). */
  withSlogan?: boolean;
  /** Slogan in the page language (messages `meta.slogan`). */
  slogan?: string;
  className?: string;
}

/**
 * Emblem + "ZODIAC BLEND" wordmark. The wordmark is always Latin (like the logo), the slogan is in
 * the page language. Decorative: give the parent link an accessible name (nav.homeLink).
 */
export function SiteLogo({ withSlogan = false, slogan, className }: SiteLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/brand/emblem-128.png"
        alt=""
        width={128}
        height={128}
        className="size-10 shrink-0 drop-shadow-[0_0_10px_rgb(199_137_51/0.35)] sm:size-11"
        priority
      />
      <span className="flex flex-col items-start leading-none">
        <span
          lang="en"
          dir="ltr"
          className="font-display text-[1.05rem] font-semibold tracking-[0.12em] text-gold-gradient sm:text-[1.2rem]"
        >
          ZODIAC BLEND
        </span>
        {withSlogan && slogan ? (
          <span className="mt-1 hidden font-serif text-[0.8rem] tracking-wide text-gold-light/80 italic sm:block rtl:mt-1.5 rtl:text-[0.85rem] rtl:tracking-normal rtl:not-italic">
            {slogan}
          </span>
        ) : null}
      </span>
    </span>
  );
}
