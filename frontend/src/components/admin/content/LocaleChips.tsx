import { localeLabel } from "@/lib/admin/translations";
import type { Locale } from "@/lib/admin/types";
import { cn } from "@/lib/cn";

/**
 * Compact "EN AR" language markers for list rows: filled = translated (has a title), dashed =
 * missing. Screen readers hear "English: translated, Arabic: missing".
 */
export function LocaleChips({
  locales,
  available,
  className,
}: {
  locales: Locale[];
  /** Locales that are translated. */
  available: Locale[];
  className?: string;
}) {
  return (
    <span className={cn("inline-flex gap-1", className)}>
      {locales.map((locale) => {
        const ok = available.includes(locale);
        return (
          <span
            key={locale}
            title={`${localeLabel(locale)}: ${ok ? "translated" : "missing"}`}
            className={cn(
              "inline-flex h-5 items-center rounded px-1.5 text-[0.65rem] font-semibold tracking-wide uppercase ring-1 ring-inset",
              ok
                ? "bg-stone-100 text-stone-700 ring-stone-300/70"
                : "text-stone-400 ring-stone-300 [border-style:dashed]",
            )}
          >
            {locale}
            <span className="sr-only">
              {" "}
              ({localeLabel(locale)}: {ok ? "translated" : "missing"})
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Locales of a translations map that have a non-empty title. */
export function titledLocales(
  translations: Partial<Record<Locale, { title?: string } | undefined>> | null | undefined,
  locales: Locale[],
): Locale[] {
  return locales.filter((locale) => translations?.[locale]?.title?.trim());
}
