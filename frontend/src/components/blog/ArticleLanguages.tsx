import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { isAppLocale, LOCALE_META } from "@/i18n/routing";
import { cn } from "@/lib/cn";

/**
 * "Also available in: العربية": links to the same article in its other languages
 * (`available_locales` from the API). Renders nothing when there is no other language.
 */
export async function ArticleLanguages({
  slug,
  locale,
  available,
  className,
}: {
  slug: string;
  locale: string;
  available: readonly string[];
  className?: string;
}) {
  const others = available.filter((l) => l !== locale).filter(isAppLocale);
  if (others.length === 0) return null;
  const t = await getTranslations("blogPage");
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="eyebrow">{t("alsoIn")}</p>
      <ul className="flex flex-wrap items-center gap-2.5">
        {others.map((l) => (
          <li key={l}>
            <Link
              href={`/blog/${slug}`}
              locale={l}
              hrefLang={l}
              lang={l}
              dir={LOCALE_META[l].dir}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-fg transition-colors hover:border-ornament hover:bg-gold-light/10"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="size-4 text-ornament"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <circle cx="10" cy="10" r="7.5" />
                <path d="M2.5 10h15M10 2.5c2.2 2.3 3.2 4.8 3.2 7.5S12.2 15.2 10 17.5C7.8 15.2 6.8 12.7 6.8 10S7.8 4.8 10 2.5Z" />
              </svg>
              {LOCALE_META[l].label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
