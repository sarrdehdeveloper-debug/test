"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useAdminLocales } from "@/lib/admin/hooks";
import {
  localeDir,
  localeLabel,
  localeNativeName,
  missingFields,
  setTranslationField,
  translationStatus,
  type TranslationStatus,
} from "@/lib/admin/translations";
import type { Locale, Translations } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface TranslationTabContext<T extends object> {
  locale: Locale;
  /** "rtl" for Arabic. */
  dir: "ltr" | "rtl";
  isDefault: boolean;
  /** The entry being edited (may be empty). */
  entry: Partial<T>;
  /** Update one field of this locale. */
  set: <K extends keyof T & string>(field: K, value: T[K]) => void;
  /** Spread on every content control: `{lang, dir}` (Arabic fonts + RTL). Labels stay LTR English. */
  fieldProps: { lang: string; dir: "ltr" | "rtl" };
  status: TranslationStatus;
}

export interface TranslationTabsProps<T extends object> {
  /** `{en: {...}, ar: {...}}` (missing locales are fine). */
  value: Translations<T> | null | undefined;
  onChange: (next: Translations<T>) => void;
  /** Fields that count for the completeness dot on each tab. */
  fields: ReadonlyArray<keyof T & string>;
  /** Render the editor of one locale. */
  children: (context: TranslationTabContext<T>) => ReactNode;
  /** Locales to show (default: `locales` of GET /public-config, default locale first). */
  locales?: Locale[];
  /** Locales with a validation error (their tab gets a red marker). */
  errorLocales?: Locale[];
  /** Accessible name of the tab list (default "Translations"). */
  label?: string;
  /** Explain what a missing translation means on this page (shown on empty non-default tabs). */
  missingHint?: ReactNode;
  className?: string;
}

const STATUS_TEXT: Record<TranslationStatus, string> = {
  complete: "complete",
  partial: "incomplete",
  empty: "missing translation",
};

function StatusDot({ status, error }: { status: TranslationStatus; error: boolean }) {
  if (error) {
    return <span aria-hidden="true" className="size-2 rounded-full bg-danger" />;
  }
  if (status === "complete") {
    return (
      <span
        aria-hidden="true"
        className="flex size-4 items-center justify-center rounded-full bg-success-soft text-success"
      >
        <Icon name="check" className="size-3" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 rounded-full",
        status === "partial" ? "bg-warning" : "border border-stone-400 bg-transparent",
      )}
    />
  );
}

/**
 * Edit a translations map with one tab per locale (`en`, `ar` from public-config), a completeness
 * indicator per tab and RTL/Arabic-font editing for Arabic.
 *
 *   <TranslationTabs<OfferTranslation>
 *     value={form.translations}
 *     onChange={(translations) => setForm({ ...form, translations })}
 *     fields={["title", "subtitle", "body", "cta_label"]}
 *   >
 *     {({ entry, set, fieldProps, isDefault }) => (
 *       <>
 *         <Field label="Title" required={isDefault}><TextInput {...fieldProps} value={entry.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
 *         <Field label="Body"><MarkdownEditor {...fieldProps} value={entry.body ?? ""} onChange={(v) => set("body", v)} /></Field>
 *       </>
 *     )}
 *   </TranslationTabs>
 */
export function TranslationTabs<T extends object>({
  value,
  onChange,
  fields,
  children,
  locales: localesProp,
  errorLocales = [],
  label = "Translations",
  missingHint,
  className,
}: TranslationTabsProps<T>) {
  const config = useAdminLocales();
  const locales = localesProp?.length ? localesProp : config.locales;
  const defaultLocale = locales.includes(config.defaultLocale) ? config.defaultLocale : locales[0];
  const [selected, setSelected] = useState<Locale>(defaultLocale);
  const active = locales.includes(selected) ? selected : defaultLocale;
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = locales.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setSelected(locales[next]);
    tabRefs.current[next]?.focus();
  };

  const dir = localeDir(active);
  const status = translationStatus<T>(value, active, fields);
  const missing = missingFields<T>(value, active, fields);
  const isDefault = active === defaultLocale;
  const context: TranslationTabContext<T> = {
    locale: active,
    dir,
    isDefault,
    entry: (value?.[active] ?? {}) as Partial<T>,
    set: (field, fieldValue) =>
      onChange(setTranslationField<T, typeof field>(value, active, field, fieldValue)),
    fieldProps: { lang: active, dir },
    status,
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-stone-200"
      >
        {locales.map((locale, index) => {
          const tabStatus = translationStatus<T>(value, locale, fields);
          const hasError = errorLocales.includes(locale);
          const selectedTab = locale === active;
          const native = localeNativeName(locale);
          return (
            <button
              key={locale}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${locale}`}
              aria-selected={selectedTab}
              aria-controls={selectedTab ? `${baseId}-panel-${locale}` : undefined}
              tabIndex={selectedTab ? 0 : -1}
              onClick={() => setSelected(locale)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative -mb-px inline-flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                selectedTab
                  ? "border-gold-bright text-ink"
                  : "border-transparent text-ink-soft hover:border-stone-300 hover:text-ink",
              )}
            >
              <StatusDot status={tabStatus} error={hasError} />
              <span>{localeLabel(locale)}</span>
              {native ? (
                <span
                  lang={locale}
                  dir={localeDir(locale)}
                  className="text-[0.8125rem] text-ink-soft"
                >
                  {native}
                </span>
              ) : null}
              {locale === defaultLocale ? (
                <span className="rounded bg-stone-100 px-1.5 py-px text-[0.65rem] font-semibold tracking-wide text-stone-600 uppercase">
                  Default
                </span>
              ) : null}
              <span className="sr-only">({hasError ? "has errors" : STATUS_TEXT[tabStatus]})</span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="space-y-4 pt-4"
      >
        {!isDefault && status !== "complete" ? (
          <p className="flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2 text-[0.8125rem] text-ink-soft ring-1 ring-stone-200 ring-inset">
            <Icon name="info" className="mt-px size-4 text-stone-500" />
            <span>
              {status === "empty"
                ? (missingHint ??
                  `Not translated yet: visitors see the ${localeLabel(defaultLocale)} text instead.`)
                : `Still empty in ${localeLabel(active)}: ${missing.map((f) => f.replace(/_/g, " ")).join(", ")}.`}
            </span>
          </p>
        ) : null}
        {children(context)}
      </div>
    </div>
  );
}
