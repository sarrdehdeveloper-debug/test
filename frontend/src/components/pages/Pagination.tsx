import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { pageHref, paginationItems } from "./helpers/pagination";

function Chevron({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-4 shrink-0 rtl:-scale-x-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "prev" ? "m12 5-5 5 5 5" : "m8 5 5 5-5 5"} />
    </svg>
  );
}

const STEP =
  "inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-fg transition-colors hover:border-ornament hover:bg-gold-light/10";
const STEP_DISABLED =
  "inline-flex h-11 items-center gap-2 rounded-full border border-line/60 px-4 text-sm font-semibold text-muted/60";
const NUMBER =
  "grid size-11 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors";

/**
 * Accessible pagination for list pages: numbered links from `sm`, "Page X of Y" on phones.
 * Hrefs are locale-less (`/blog?page=2`); page 1 links to the bare path.
 */
export async function Pagination({
  basePath,
  page,
  count,
  className,
}: {
  basePath: string;
  page: number;
  count: number;
  className?: string;
}) {
  if (count <= 1) return null;
  const t = await getTranslations("blogPage");
  const items = paginationItems(page, count);
  const prev = page > 1 ? pageHref(basePath, page - 1) : null;
  const next = page < count ? pageHref(basePath, page + 1) : null;

  return (
    <nav aria-label={t("pagination.label")} className={cn("flex justify-center", className)}>
      <div className="flex w-full max-w-xl items-center justify-between gap-3 sm:w-auto sm:max-w-none sm:justify-center">
        {prev ? (
          <Link href={prev} rel="prev" aria-label={t("pagination.previousPage")} className={STEP}>
            <Chevron direction="prev" />
            <span className="max-sm:sr-only">{t("pagination.previous")}</span>
          </Link>
        ) : (
          <span aria-hidden="true" className={STEP_DISABLED}>
            <Chevron direction="prev" />
            <span className="max-sm:sr-only">{t("pagination.previous")}</span>
          </span>
        )}

        <p className="text-sm font-medium text-muted sm:hidden">
          {t("pageOf", { page: String(page), total: String(count) })}
        </p>

        <ul className="hidden items-center gap-1 sm:flex">
          {items.map((item, index) =>
            item === "gap" ? (
              <li key={`gap-${index}`} aria-hidden="true" className="w-8 text-center text-muted">
                …
              </li>
            ) : (
              <li key={item}>
                <Link
                  href={pageHref(basePath, item)}
                  aria-label={t("pagination.page", { page: String(item) })}
                  aria-current={item === page ? "page" : undefined}
                  className={cn(
                    NUMBER,
                    item === page
                      ? "bg-night text-gold-light shadow-card"
                      : "text-fg hover:bg-gold-light/15",
                  )}
                >
                  {item}
                </Link>
              </li>
            ),
          )}
        </ul>

        {next ? (
          <Link href={next} rel="next" aria-label={t("pagination.nextPage")} className={STEP}>
            <span className="max-sm:sr-only">{t("pagination.next")}</span>
            <Chevron direction="next" />
          </Link>
        ) : (
          <span aria-hidden="true" className={STEP_DISABLED}>
            <span className="max-sm:sr-only">{t("pagination.next")}</span>
            <Chevron direction="next" />
          </span>
        )}
      </div>
    </nav>
  );
}
