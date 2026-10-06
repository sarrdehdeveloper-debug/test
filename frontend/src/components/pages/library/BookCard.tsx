import { getTranslations } from "next-intl/server";
import { ArrowIcon, Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { isExternalUrl } from "@/lib/format";
import { toSiteHref } from "@/lib/links";
import type { BookOut } from "@/lib/types";
import { BookCover } from "./BookCover";

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-3.5 shrink-0 rtl:-scale-x-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4h5v5M16 4l-7 7M8.5 5H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2.5" />
    </svg>
  );
}

/** "Buy the book" (external shop, new tab) or a "Coming soon" badge when there is no link yet. */
export async function BookAction({ book, className }: { book: BookOut; className?: string }) {
  const [t, tc] = await Promise.all([getTranslations("libraryPage"), getTranslations("common")]);
  if (!book.purchase_url) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-dashed border-ornament/60 bg-gold-light/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-accent uppercase rtl:text-sm rtl:tracking-normal",
          className,
        )}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ornament" />
        {t("comingSoon")}
      </span>
    );
  }
  const href = toSiteHref(book.purchase_url);
  if (!isExternalUrl(href)) {
    return (
      <Button href={href} size="sm" icon={<ArrowIcon />} className={className}>
        {t("buy")}
        <span className="sr-only">: {book.title}</span>
      </Button>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses({ size: "sm", className })}
    >
      <span>
        {t("buy")}
        <span className="sr-only">
          : {book.title} {tc("opensInNewTab")}
        </span>
      </span>
      <ExternalIcon />
    </a>
  );
}

/** A book of a Galaxy Library series: cover, title, description and purchase action. */
export async function BookCard({
  book,
  imprint,
  layout = "stack",
  headingLevel: H = "h3",
}: {
  book: BookOut;
  /** Series or library name printed on drawn covers. */
  imprint: string;
  /** "stack": cover above text (grids); "row": cover beside text (series page). */
  layout?: "stack" | "row";
  headingLevel?: "h3" | "h4";
}) {
  const row = layout === "row";
  return (
    <Card
      as="article"
      padding="none"
      className={cn("flex h-full overflow-hidden", row ? "flex-col sm:flex-row" : "flex-col")}
    >
      <div
        className={cn(
          "flex items-center justify-center bg-parchment/70",
          row ? "px-10 pt-10 pb-8 sm:w-64 sm:shrink-0 sm:px-8 sm:py-10" : "px-10 pt-10 pb-8",
        )}
      >
        <BookCover
          src={book.cover_image_url}
          title={book.title}
          imprint={imprint}
          className={row ? "w-40 sm:w-full" : "w-36 sm:w-40"}
          sizes="(min-width: 640px) 192px, 160px"
        />
      </div>
      <div className={cn("flex flex-1 flex-col", row ? "p-6 sm:p-8 lg:p-10" : "p-6 sm:p-7")}>
        <H
          className={cn(
            "font-serif leading-tight font-semibold text-fg",
            row ? "text-[1.9rem]" : "text-2xl",
          )}
        >
          {book.title}
        </H>
        {book.description_html ? (
          <div
            className={cn(
              "prose-zb mt-3 leading-relaxed text-muted [&_em]:text-accent",
              row ? "text-[1.05rem]" : "text-[0.98rem]",
            )}
            dangerouslySetInnerHTML={{ __html: book.description_html }}
          />
        ) : null}
        <div className="mt-auto pt-6">
          <BookAction book={book} />
        </div>
      </div>
    </Card>
  );
}
