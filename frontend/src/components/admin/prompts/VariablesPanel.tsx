"use client";

import { useId, useMemo, useState } from "react";
import { Icon } from "@/components/admin/icons";
import { ErrorState, LoadingState } from "@/components/admin/QueryState";
import type { PromptVariable } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { formatExample, variableSnippet } from "./template";

const GROUPS: Array<{ id: string; label: string; test: (name: string) => boolean }> = [
  { id: "reader", label: "Reader", test: (n) => ["language", "locale", "name"].includes(n) },
  { id: "western", label: "Western chart", test: (n) => /^(sun|moon|ascendant)/.test(n) },
  { id: "chinese", label: "Chinese chart (BaZi)", test: (n) => /^(year|month|day|hour)_/.test(n) },
];

export interface VariablesPanelProps {
  variables: PromptVariable[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Names already used in the edited text (marked with a dot). */
  used?: ReadonlySet<string>;
  /** Click handler; omit for a read-only reference. */
  onInsert?: (name: string) => void;
  /** Where a click inserts ("template", "system instruction"). */
  targetLabel?: string;
  className?: string;
}

/**
 * Reference of the template variables (`GET /prompts/variables`) grouped by topic, with the sample
 * value used by previews. Clicking one inserts `{{ name }}` at the caret of the last edited field.
 */
export function VariablesPanel({
  variables,
  loading = false,
  error,
  onRetry,
  used,
  onInsert,
  targetLabel,
  className,
}: VariablesPanelProps) {
  const [filter, setFilter] = useState("");
  const titleId = useId();

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const visible = (variables ?? []).filter(
      (v) => !q || v.name.includes(q) || v.description.toLowerCase().includes(q),
    );
    const out = GROUPS.map((group) => ({
      ...group,
      items: visible.filter((v) => group.test(v.name)),
    }));
    const other = visible.filter((v) => !GROUPS.some((g) => g.test(v.name)));
    if (other.length) out.push({ id: "other", label: "Other", test: () => true, items: other });
    return out.filter((group) => group.items.length);
  }, [variables, filter]);

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex min-h-0 flex-col rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgb(31_36_48/0.04)]",
        className,
      )}
    >
      <header className="border-b border-stone-200/80 px-4 py-3">
        <h2 id={titleId} className="text-[0.95rem] font-semibold text-ink">
          Variables
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
          {onInsert
            ? `Click to insert at the cursor in the ${targetLabel ?? "template"}.`
            : "Available in templates as {{ name }}."}{" "}
          Examples are the preview sample.
        </p>
        <label className="relative mt-2.5 block">
          <span className="sr-only">Filter variables</span>
          <Icon
            name="search"
            className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter…"
            className="h-8 w-full rounded-md border border-stone-300 bg-white ps-8 pe-2 text-[0.8125rem] placeholder:text-stone-400 focus:border-gold-bright focus:ring-3 focus:ring-gold-light/40 focus:outline-none"
          />
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && !variables ? (
          <LoadingState lines={6} className="p-2" label="Loading variables…" />
        ) : error && !variables ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : !groups.length ? (
          <p className="px-2 py-6 text-center text-[0.8125rem] text-ink-soft">
            No variable matches.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="mb-2 last:mb-0">
              <h3 className="px-2 pt-1.5 pb-1 text-[0.65rem] font-semibold tracking-wider text-ink-soft uppercase">
                {group.label}
              </h3>
              <ul>
                {group.items.map((variable) => {
                  const isUsed = used?.has(variable.name) ?? false;
                  const body = (
                    <>
                      <span className="flex items-center gap-1.5">
                        <code className="font-mono text-[0.75rem] font-semibold text-gold-deep">
                          {variableSnippet(variable.name)}
                        </code>
                        {isUsed ? (
                          <span
                            className="size-1.5 rounded-full bg-success"
                            title="Used in this text"
                          >
                            <span className="sr-only">(used)</span>
                          </span>
                        ) : null}
                        {onInsert ? (
                          <Icon
                            name="plus"
                            className="ms-auto size-3.5 shrink-0 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
                        {variable.description}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.7rem] text-stone-500">
                        e.g. <span className="text-ink">{formatExample(variable.example)}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={variable.name}>
                      {onInsert ? (
                        <button
                          type="button"
                          onClick={() => onInsert(variable.name)}
                          className="group block w-full rounded-md px-2 py-1.5 text-start hover:bg-ivory focus-visible:bg-ivory"
                        >
                          <span className="sr-only">Insert </span>
                          {body}
                        </button>
                      ) : (
                        <div className="px-2 py-1.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
