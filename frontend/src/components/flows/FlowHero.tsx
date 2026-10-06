import type { ReactNode, Ref } from "react";
import { GoldRule, Ornament } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";

export interface FlowHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Extra content under the lead (chips, buttons, status). */
  children?: ReactNode;
  /** Leave room at the bottom for a card that overlaps the band (see FlowSurface). */
  overlap?: boolean;
  headingId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  /** Make the heading focusable from script (status changes). */
  focusableHeading?: boolean;
  className?: string;
}

/**
 * Night-sky page header of the reading flows (no hooks: usable from Server and Client Components).
 * The page's single <h1> lives here.
 */
export function FlowHero({
  eyebrow,
  title,
  lead,
  children,
  overlap = false,
  headingId,
  headingRef,
  focusableHeading = false,
  className,
}: FlowHeroProps) {
  return (
    <section
      data-tone="night"
      aria-labelledby={headingId}
      className={cn("relative isolate overflow-hidden bg-night-sky", className)}
    >
      <StarField density="medium" seed={11} className="-z-10" />
      <Container
        size="narrow"
        className={cn(
          "animate-fade-up pt-12 pb-14 text-center sm:pt-16 sm:pb-20",
          overlap && "pb-32 sm:pb-40",
        )}
      >
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1
          id={headingId}
          ref={headingRef}
          tabIndex={focusableHeading ? -1 : undefined}
          className="mt-4 font-serif text-[2.35rem] leading-[1.1] font-semibold text-balance text-ivory focus:outline-none sm:text-5xl rtl:leading-[1.35]"
        >
          {title}
        </h1>
        <Ornament className="mx-auto mt-5 h-4 w-40 text-gold-bright" />
        {lead ? (
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-mist">{lead}</p>
        ) : null}
        {children}
      </Container>
      {overlap ? null : <GoldRule className="absolute inset-x-0 bottom-0" />}
    </section>
  );
}

/**
 * Ivory surface whose first child overlaps the FlowHero above it (use `<FlowHero overlap>`).
 */
export function FlowSurface({
  children,
  size = "narrow",
  className,
}: {
  children: ReactNode;
  size?: "narrow" | "default" | "wide";
  className?: string;
}) {
  return (
    <div data-tone="ivory" className="relative flow-root bg-ivory pb-16 sm:pb-24">
      <Container size={size} className={cn("relative -mt-24 sm:-mt-32", className)}>
        {children}
      </Container>
    </div>
  );
}

/** Small pill shown in hero bands ("Instant result", price...). */
export function HeroChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-gold-light/25 bg-white/[0.04] px-3.5 py-1.5 text-sm text-mist",
        className,
      )}
    >
      {children}
    </span>
  );
}
