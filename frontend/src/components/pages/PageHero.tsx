import type { ReactNode } from "react";
import { GoldRule, Ornament } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

export interface PageHeroProps {
  /** Id of the <h1>; the section is labelled by it. */
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  lead?: ReactNode;
  breadcrumbs?: Crumb[];
  breadcrumbLabel?: string;
  /** "center" for list pages, "start" for long reads. */
  align?: "center" | "start";
  /** Illustration shown on the end side from `lg` (stacks under the text on phones). */
  aside?: ReactNode;
  /** Extra content under the lead (meta row, buttons). */
  children?: ReactNode;
  containerSize?: "narrow" | "default" | "wide";
  /** Star field seed, so each page has its own sky. */
  seed?: number;
  className?: string;
}

/**
 * Night-sky page header of the content pages (offers, blog, library, legal, contact):
 * breadcrumbs, eyebrow, serif <h1>, gold ornament and lead, matching the home hero.
 */
export function PageHero({
  id,
  title,
  eyebrow,
  lead,
  breadcrumbs,
  breadcrumbLabel,
  align = "center",
  aside,
  children,
  containerSize = "default",
  seed = 11,
  className,
}: PageHeroProps) {
  const centered = align === "center" && !aside;
  return (
    <section
      data-tone="night"
      aria-labelledby={id}
      className={cn("relative isolate overflow-hidden bg-night-sky", className)}
    >
      <StarField density="medium" seed={seed} className="-z-10" />
      <Container
        size={containerSize}
        className={cn(
          "pt-8 pb-14 sm:pt-10 sm:pb-18 lg:pb-22",
          aside
            ? "grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14"
            : null,
        )}
      >
        <div
          className={cn(
            "animate-fade-up",
            centered ? "text-center" : aside ? "text-center lg:text-start" : "text-start",
          )}
        >
          {breadcrumbs?.length ? (
            <Breadcrumbs
              items={breadcrumbs}
              label={breadcrumbLabel}
              className={cn(
                "mb-8 sm:mb-10",
                centered ? "justify-center" : aside ? "justify-center lg:justify-start" : "",
              )}
            />
          ) : (
            <div aria-hidden="true" className="h-2 sm:h-4" />
          )}
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1
            id={id}
            className="mt-4 font-serif text-[2.4rem] leading-[1.08] font-semibold text-ivory sm:text-5xl lg:text-[3.6rem] rtl:leading-[1.35]"
          >
            {title}
          </h1>
          <Ornament
            className={cn(
              "mt-6 h-4 w-40 text-gold-bright",
              centered ? "mx-auto" : aside ? "mx-auto lg:mx-0" : "",
            )}
          />
          {lead ? (
            <p
              className={cn(
                "mt-6 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl",
                centered ? "mx-auto" : aside ? "mx-auto lg:mx-0" : "",
              )}
            >
              {lead}
            </p>
          ) : null}
          {children}
        </div>
        {aside ? <div className="mx-auto w-full max-w-sm lg:max-w-none">{aside}</div> : null}
      </Container>
      <GoldRule className="absolute inset-x-0 bottom-0" />
    </section>
  );
}
