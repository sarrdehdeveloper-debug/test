"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { getPathname, Link, usePathname } from "@/i18n/navigation";
import { LOCALE_META, routing, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

export interface LanguageSwitcherProps {
  className?: string;
  /** "pill" for the header, "inline" for menus and the footer. */
  variant?: "pill" | "inline";
  onSwitch?: () => void;
}

/**
 * Links to the current page in the other locale(s). Keeps the path, and the query string and
 * hash too (e.g. the report link token in `#t=...`).
 */
export function LanguageSwitcher({ className, variant = "pill", onSwitch }: LanguageSwitcherProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const others = routing.locales.filter((l) => l !== locale);

  const handleClick = (target: AppLocale) => (event: MouseEvent<HTMLAnchorElement>) => {
    onSwitch?.();
    const { search, hash, origin } = window.location;
    if (!search && !hash) return;
    event.preventDefault();
    const path = getPathname({ href: pathname, locale: target });
    window.location.assign(new URL(`${path}${search}${hash}`, origin).href);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {others.map((target) => (
        <Link
          key={target}
          href={pathname}
          locale={target}
          hrefLang={target}
          onClick={handleClick(target)}
          className={cn(
            "inline-flex items-center gap-2 font-medium transition-colors",
            variant === "pill"
              ? "h-9 rounded-full border border-gold-light/30 px-3.5 text-sm text-ivory/90 hover:border-gold-light/70 hover:text-gold-light"
              : "py-1 text-fg hover:text-accent",
          )}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 text-gold-light" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M2.5 10h15M10 2.5c2.2 2.3 3.2 4.8 3.2 7.5S12.2 15.2 10 17.5C7.8 15.2 6.8 12.7 6.8 10S7.8 4.8 10 2.5Z" />
          </svg>
          <span className="sr-only">{t("language")}: </span>
          <span lang={target} dir={LOCALE_META[target].dir}>
            {LOCALE_META[target].label}
          </span>
        </Link>
      ))}
    </div>
  );
}
