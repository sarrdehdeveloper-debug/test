import type { ReactNode } from "react";
import { Crescent, Sparkle } from "@/components/decor/Ornament";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * "Temporarily unavailable" state for content that comes from the API (API down, timeout, 5xx).
 * `retryHref` must be the full, locale-prefixed path: it is a plain link that reloads the page.
 */
export function UnavailableNotice({
  title,
  body,
  bodyHtml,
  retryHref,
  retryLabel,
  actions,
  className,
}: {
  title: string;
  body?: ReactNode;
  /** Sanitised HTML (e.g. the bundled "temporarily unavailable" legal notice). */
  bodyHtml?: string;
  retryHref: string;
  retryLabel: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-2xl rounded-3xl border border-warning/25 bg-warning-soft/70 px-6 py-10 text-center sm:px-10",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mx-auto grid size-14 place-items-center rounded-full border border-warning/30 bg-card text-warning"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 18a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.6 1.4A3.75 3.75 0 0 1 17.25 18Z" />
          <path d="M12 11v3m0 2.5h.01" />
        </svg>
      </span>
      <h2 className="mt-5 font-serif text-2xl font-semibold text-ink sm:text-3xl">{title}</h2>
      {body ? <p className="mx-auto mt-3 max-w-lg text-ink-soft">{body}</p> : null}
      {bodyHtml ? (
        <div
          className="prose-zb mx-auto mt-3 max-w-lg text-ink-soft"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : null}
      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <a href={retryHref} className={buttonClasses({ variant: "primary" })}>
          {retryLabel}
        </a>
        {actions}
      </div>
    </div>
  );
}

/** Empty list state (no offers, no posts, no books yet) with optional actions. */
export function EmptyState({
  title,
  body,
  actions,
  icon = "sparkle",
  headingLevel: H = "h2",
  className,
}: {
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  icon?: "sparkle" | "crescent";
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-2xl rounded-3xl border border-line bg-card px-6 py-12 text-center shadow-card sm:px-12",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="relative mx-auto grid size-16 place-items-center rounded-full border border-line text-ornament"
      >
        {icon === "crescent" ? <Crescent className="size-7" /> : <Sparkle className="size-7" />}
        <Sparkle className="absolute -end-1 top-1 size-2.5 text-gold-light" />
      </span>
      <H className="mt-6 font-serif text-3xl leading-tight font-semibold text-fg">{title}</H>
      {body ? <p className="mx-auto mt-4 max-w-lg text-lg text-muted">{body}</p> : null}
      {actions ? (
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
