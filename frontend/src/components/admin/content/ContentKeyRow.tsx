"use client";

import { memo } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { Field, TextArea, TextInput } from "@/components/admin/form";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";
import { Badge } from "@/components/admin/StatusBadge";
import { localeDir, localeLabel, localeNativeName } from "@/lib/admin/translations";
import type { ContentKey, Locale } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { contentControl, lineCount, type ContentControl } from "./siteContent";

const MAX_LENGTH = 20_000;

const FORMAT_BADGE: Partial<Record<ContentControl, string>> = {
  lines: "List · one item per line",
  markdown: "Markdown",
};

export interface ContentKeyRowProps {
  contentKey: ContentKey;
  locales: Locale[];
  defaultLocale: Locale;
  /** Current (draft) value per locale. */
  values: Record<Locale, string>;
  /** Saved value per locale. */
  saved: Record<Locale, string>;
  /** Save errors per locale. */
  errors?: Record<Locale, string | undefined>;
  onChange: (locale: Locale, key: string, value: string) => void;
  disabled?: boolean;
}

function filled(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/** Fallback explanation for an empty value (what visitors see instead). */
function emptyHint(locale: Locale, defaultLocale: Locale, values: Record<Locale, string>): string {
  if (locale !== defaultLocale && filled(values[defaultLocale])) {
    return `Untranslated: ${localeLabel(locale)} visitors see the ${localeLabel(defaultLocale)} text.`;
  }
  return "Empty: the site shows its built-in default text.";
}

/**
 * One editable site-content key: description, key name and format, then one editor per locale
 * side by side (stacked on small screens). Arabic editors are RTL with Arabic fonts; edited values
 * are marked and can be reverted individually.
 */
function ContentKeyRowView({
  contentKey,
  locales,
  defaultLocale,
  values,
  saved,
  errors,
  onChange,
  disabled,
}: ContentKeyRowProps) {
  const control = contentControl(contentKey);
  const anyChanged = locales.some((locale) => (values[locale] ?? "") !== (saved[locale] ?? ""));
  const missing = locales.filter((l) => !filled(values[l]));
  const untranslated = missing.length > 0 && missing.length < locales.length;

  return (
    <div
      id={`key-${contentKey.key}`}
      className={cn(
        "scroll-mt-24 px-4 py-4 transition-colors sm:px-5",
        anyChanged && "bg-gold-pale/15",
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{contentKey.description}</h3>
          <p className="mt-0.5 font-mono text-[0.7rem] break-all text-ink-soft" dir="ltr">
            {contentKey.key}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FORMAT_BADGE[control] ? <Badge tone="neutral">{FORMAT_BADGE[control]}</Badge> : null}
          {untranslated ? (
            <Badge tone="warning" dot>
              Untranslated
            </Badge>
          ) : missing.length === locales.length ? (
            <Badge tone="neutral" dot>
              Empty
            </Badge>
          ) : null}
          {anyChanged ? (
            <Badge tone="gold" dot>
              Unsaved
            </Badge>
          ) : null}
        </div>
      </div>

      <div className={cn("grid gap-x-5 gap-y-4", locales.length > 1 && "lg:grid-cols-2")}>
        {locales.map((locale) => {
          const value = values[locale] ?? "";
          const changed = value !== (saved[locale] ?? "");
          const dir = localeDir(locale);
          const native = localeNativeName(locale);
          const fieldProps = { lang: locale, dir };
          const error = errors?.[locale];
          const hint = !filled(value)
            ? emptyHint(locale, defaultLocale, values)
            : control === "lines"
              ? `${lineCount(value)} ${lineCount(value) === 1 ? "item" : "items"} · one per line`
              : undefined;
          const label = (
            <span className="flex h-4 items-center gap-2 text-xs leading-none font-semibold tracking-wide text-ink-soft uppercase">
              <span>{localeLabel(locale)}</span>
              {native ? (
                <span
                  lang={locale}
                  dir={dir}
                  className="text-[0.8rem] leading-none font-normal normal-case"
                >
                  {native}
                </span>
              ) : null}
              <span className="sr-only">: {contentKey.description}</span>
              {changed ? (
                <span className="flex items-center gap-1 font-medium normal-case tracking-normal text-gold-deep">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-bright" />
                  Edited
                </span>
              ) : null}
            </span>
          );
          return (
            <div key={locale} className="relative min-w-0">
              {changed ? (
                <div className="absolute end-0 -top-1.5 z-10">
                  <AdminButton
                    size="xs"
                    variant="ghost"
                    icon="refresh"
                    onClick={() => onChange(locale, contentKey.key, saved[locale] ?? "")}
                    disabled={disabled}
                    aria-label={`Revert ${localeLabel(locale)}: ${contentKey.description}`}
                  >
                    Revert
                  </AdminButton>
                </div>
              ) : null}
              <Field label={label} hint={hint} error={error}>
                {control === "markdown" ? (
                  <MarkdownEditor
                    {...fieldProps}
                    value={value}
                    onChange={(next) => onChange(locale, contentKey.key, next)}
                    rows={10}
                    maxLength={MAX_LENGTH}
                    defaultView="write"
                    disabled={disabled}
                  />
                ) : control === "input" ? (
                  <TextInput
                    {...fieldProps}
                    value={value}
                    onChange={(event) => onChange(locale, contentKey.key, event.target.value)}
                    maxLength={MAX_LENGTH}
                    disabled={disabled}
                    className={cn(!filled(value) && "border-dashed")}
                  />
                ) : (
                  <TextArea
                    {...fieldProps}
                    value={value}
                    onChange={(event) => onChange(locale, contentKey.key, event.target.value)}
                    rows={control === "lines" ? Math.min(8, Math.max(4, lineCount(value) + 1)) : 3}
                    maxLength={MAX_LENGTH}
                    disabled={disabled}
                    className={cn("resize-y", !filled(value) && "border-dashed")}
                  />
                )}
              </Field>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sameRecord(
  a: Record<string, string | undefined> | undefined,
  b: Record<string, string | undefined> | undefined,
): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) if (a?.[key] !== b?.[key]) return false;
  return true;
}

/** Re-renders only when this key's values change (the page holds ~70 rows × locales). */
export const ContentKeyRow = memo(
  ContentKeyRowView,
  (prev, next) =>
    prev.contentKey === next.contentKey &&
    prev.locales === next.locales &&
    prev.defaultLocale === next.defaultLocale &&
    prev.onChange === next.onChange &&
    prev.disabled === next.disabled &&
    sameRecord(prev.values, next.values) &&
    sameRecord(prev.saved, next.saved) &&
    sameRecord(prev.errors, next.errors),
);
