"use client";

import { useMemo } from "react";
import type { Locale } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { diffLines, diffStats } from "./diff";
import { DiffStatsLabel, DiffView } from "./DiffView";

/** The comparable fields of a prompt version (saved or the editor's unsaved form). */
export interface PromptSnapshot {
  /** "Published v1", "Draft v2 (unsaved)". */
  label: string;
  name: string;
  section_titles: Record<Locale, string>;
  min_words: number | null;
  system_instruction: string;
  template: string;
}

const LOCALE_NAMES: Record<string, string> = { en: "English", ar: "Arabic" };

function minWordsText(value: number | null, globalMinWords?: number | null): string {
  if (value === null)
    return globalMinWords != null ? `Global setting (${globalMinWords})` : "Global setting";
  return `${value} words`;
}

/** Line-level change counts of the two long fields (for publish confirmations). */
export function snapshotStats(before: PromptSnapshot, after: PromptSnapshot) {
  return {
    template: diffStats(diffLines(before.template, after.template)),
    system: diffStats(diffLines(before.system_instruction, after.system_instruction)),
  };
}

export interface VersionChangesProps {
  before: PromptSnapshot;
  after: PromptSnapshot;
  globalMinWords?: number | null;
  className?: string;
}

/** Field changes (name, titles, minimum words) plus line diffs of system instruction and template. */
export function VersionChanges({ before, after, globalMinWords, className }: VersionChangesProps) {
  const stats = useMemo(() => snapshotStats(before, after), [before, after]);
  const simple: Array<{ label: string; from: string; to: string; lang?: string }> = [];
  if (before.name.trim() !== after.name.trim()) {
    simple.push({ label: "Name", from: before.name, to: after.name });
  }
  const locales = [
    ...new Set([...Object.keys(before.section_titles), ...Object.keys(after.section_titles)]),
  ];
  for (const locale of locales) {
    const from = (before.section_titles[locale] ?? "").trim();
    const to = (after.section_titles[locale] ?? "").trim();
    if (from !== to) {
      simple.push({
        label: `Section title (${LOCALE_NAMES[locale] ?? locale})`,
        from: from || "—",
        to: to || "—",
        lang: locale,
      });
    }
  }
  if (before.min_words !== after.min_words) {
    simple.push({
      label: "Minimum words",
      from: minWordsText(before.min_words, globalMinWords),
      to: minWordsText(after.min_words, globalMinWords),
    });
  }
  const nothing = !simple.length && stats.template.same && stats.system.same;

  return (
    <div className={cn("space-y-5", className)}>
      <p className="text-[0.8125rem] text-ink-soft">
        Comparing <span className="font-medium text-ink">{before.label}</span> →{" "}
        <span className="font-medium text-ink">{after.label}</span>
      </p>
      {nothing ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-ink-soft">
          These versions are identical.
        </p>
      ) : null}
      {simple.length ? (
        <dl className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {simple.map((change) => (
            <div
              key={change.label}
              className="grid gap-1 px-3 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)]"
            >
              <dt className="text-[0.8125rem] text-ink-soft">{change.label}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <del
                  lang={change.lang}
                  dir={change.lang === "ar" ? "rtl" : undefined}
                  className="rounded bg-danger-soft/70 px-1.5 text-danger decoration-danger/50"
                >
                  {change.from}
                </del>
                <span aria-hidden="true" className="text-stone-400">
                  →
                </span>
                <ins
                  lang={change.lang}
                  dir={change.lang === "ar" ? "rtl" : undefined}
                  className="rounded bg-success-soft/70 px-1.5 text-success no-underline"
                >
                  {change.to}
                </ins>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!stats.system.same ? (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            System instruction <DiffStatsLabel stats={stats.system} />
          </h3>
          <DiffView
            before={before.system_instruction}
            after={after.system_instruction}
            caption={`System instruction: ${before.label} to ${after.label}`}
          />
        </section>
      ) : null}
      {!stats.template.same ? (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            Template <DiffStatsLabel stats={stats.template} />
          </h3>
          <DiffView
            before={before.template}
            after={after.template}
            caption={`Template: ${before.label} to ${after.label}`}
          />
        </section>
      ) : null}
    </div>
  );
}
