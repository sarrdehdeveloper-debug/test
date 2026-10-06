import { getTranslations } from "next-intl/server";
import { Ornament } from "@/components/decor/Ornament";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import type { SeriesOut } from "@/lib/types";
import { BookCard } from "./BookCard";
import { BookCover } from "./BookCover";

/** One series on /library: cover, title, description, link to the series page and its books. */
export async function SeriesShowcase({
  series,
  imprint,
  eager = false,
}: {
  series: SeriesOut;
  /** Printed on drawn covers, e.g. "Galaxy Library". */
  imprint: string;
  /** Load the cover eagerly (first series, above the fold). */
  eager?: boolean;
}) {
  const t = await getTranslations("libraryPage");
  const titleId = `series-${series.slug}`;
  const count = series.books.length;
  const href = `/library/${series.slug}`;

  return (
    <article aria-labelledby={titleId}>
      <div className="grid items-center gap-10 md:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="mx-auto block w-48 md:w-full">
          <BookCover
            src={series.cover_image_url}
            title={series.title}
            imprint={imprint}
            eager={eager}
            sizes="(min-width: 1024px) 272px, (min-width: 768px) 224px, 192px"
            className="transition-transform duration-500 hover:-translate-y-1"
          />
        </Link>
        <div className="text-center md:text-start">
          <p className="eyebrow">
            {t("seriesLabel")}
            {count > 0 ? (
              <>
                <span aria-hidden="true" className="mx-2 text-ornament">
                  ✦
                </span>
                {t("bookCount", { count, n: String(count) })}
              </>
            ) : null}
          </p>
          <h2
            id={titleId}
            className="mt-3 font-serif text-[2.1rem] leading-tight font-semibold text-fg sm:text-5xl rtl:leading-snug"
          >
            <Link href={href} className="underline-offset-[6px] hover:underline decoration-gold/40">
              {series.title}
            </Link>
          </h2>
          <Ornament className="mx-auto mt-5 h-4 w-36 text-ornament md:mx-0" />
          {series.description_html ? (
            <div
              className="prose-zb mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted md:mx-0"
              dangerouslySetInnerHTML={{ __html: series.description_html }}
            />
          ) : null}
          <Button href={href} variant="outline" className="mt-8" icon={<ArrowIcon />}>
            {t("viewSeries")}
            <span className="sr-only">: {series.title}</span>
          </Button>
        </div>
      </div>

      {count > 0 ? (
        <div className="mt-14 sm:mt-16">
          <h3 className="flex items-center gap-4 font-display text-xs font-semibold tracking-[0.18em] text-accent uppercase rtl:text-base rtl:tracking-normal">
            {t("booksTitle")}
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </h3>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {series.books.map((book) => (
              <li key={book.slug}>
                <BookCard book={book} imprint={series.title} headingLevel="h4" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-12 text-center text-muted md:text-start">{t("noBooks")}</p>
      )}
    </article>
  );
}
