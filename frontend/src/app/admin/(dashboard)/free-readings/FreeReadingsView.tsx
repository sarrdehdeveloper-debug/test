"use client";

import { useMemo, useState } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { Field, TextInput } from "@/components/admin/form";
import { Icon } from "@/components/admin/icons";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { Badge } from "@/components/admin/StatusBadge";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import { FilterChips, ToggleChip } from "@/components/admin/content/FilterChips";
import {
  changedReadingLocales,
  coverage,
  draftsFor,
  indexReadings,
  KIND_LABELS,
  parseReadingId,
  READING_KINDS,
  readingHint,
  readingId,
  readingKeys,
  readingName,
  readingState,
  replaceReading,
  type ReadingDraft,
  type ReadingIndex,
  type ReadingState,
} from "@/components/admin/content/freeReadings";
import { useSaveShortcut } from "@/components/admin/content/useSaveShortcut";
import { useUnsavedChanges } from "@/components/admin/content/useUnsavedChanges";
import { AnimalIcon } from "@/components/zodiac/AnimalIcon";
import { SignIcon } from "@/components/zodiac/SignIcon";
import { adminApi, toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage, adminFieldErrors } from "@/lib/admin/errors";
import { formatDateTime, formatRelative } from "@/lib/admin/format";
import { useAdminLocales, useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { toast } from "@/lib/admin/toast";
import { localeLabel } from "@/lib/admin/translations";
import type { AdminPage, FreeReading, FreeReadingKind, Locale } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import type { ChineseAnimal, WesternSign } from "@/lib/types";

const TITLE_MAX = 300;
const BODY_MAX = 20_000;

/* ================================================================== small pieces */

function ReadingGlyph({
  kind,
  itemKey,
  size = "sm",
}: {
  kind: FreeReadingKind;
  itemKey: string;
  size?: "sm" | "md";
}) {
  return kind === "sign" ? (
    <SignIcon sign={itemKey as WesternSign} size={size} />
  ) : (
    <AnimalIcon animal={itemKey as ChineseAnimal} size={size} />
  );
}

const STATE_CHIP: Record<ReadingState, { className: string; text: string }> = {
  filled: { className: "bg-success-soft text-success ring-success/25", text: "written" },
  partial: { className: "bg-warning-soft text-warning ring-warning/25", text: "incomplete" },
  missing: {
    className: "bg-white text-stone-500 ring-stone-300 [border-style:dashed]",
    text: "missing",
  },
};

function LocaleChip({ locale, state }: { locale: Locale; state: ReadingState }) {
  const style = STATE_CHIP[state];
  return (
    <span
      title={`${localeLabel(locale)}: ${style.text}`}
      className={cn(
        "inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-[0.65rem] font-semibold tracking-wide uppercase ring-1 ring-inset",
        style.className,
      )}
    >
      {state === "filled" ? <Icon name="check" className="size-3" /> : null}
      {locale}
      <span className="sr-only">
        {" "}
        ({localeLabel(locale)} {style.text})
      </span>
    </span>
  );
}

/* ================================================================== list */

interface ReadingListProps {
  index: ReadingIndex;
  locales: Locale[];
  kindFilter: string;
  missingOnly: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ReadingList({
  index,
  locales,
  kindFilter,
  missingOnly,
  selectedId,
  onSelect,
}: ReadingListProps) {
  const kinds = READING_KINDS.filter((kind) => !kindFilter || kind === kindFilter);
  const sections = kinds.map((kind) => {
    const keys = readingKeys(kind).filter((key) => {
      if (!missingOnly) return true;
      const entry = index[readingId(kind, key)];
      return locales.some((locale) => readingState(entry?.[locale]) !== "filled");
    });
    return { kind, keys, stats: coverage(index, locales, kind) };
  });
  const empty = sections.every((section) => section.keys.length === 0);

  if (empty) {
    return (
      <EmptyState
        compact
        icon="check"
        title="Every reading is written"
        description="All signs and animals have a title and text in every language."
      />
    );
  }

  return (
    <div className="divide-y divide-stone-200/80">
      {sections.map(({ kind, keys, stats }) =>
        keys.length ? (
          <section key={kind} aria-labelledby={`readings-${kind}`}>
            <div className="flex items-center justify-between gap-3 bg-stone-50/70 px-4 py-2.5">
              <h2
                id={`readings-${kind}`}
                className="font-display text-[0.68rem] font-semibold tracking-[0.18em] text-ink-soft uppercase"
              >
                {KIND_LABELS[kind].title}
              </h2>
              <span className="text-xs text-ink-soft tabular-nums">
                {stats.filled}/{stats.total} written
              </span>
            </div>
            <ul className="p-1.5">
              {keys.map((key) => {
                const id = readingId(kind, key);
                const selected = id === selectedId;
                const entry = index[id];
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => onSelect(id)}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors",
                        selected
                          ? "bg-night text-ivory [--tone-ornament:var(--color-gold-light)]"
                          : "hover:bg-stone-50",
                      )}
                    >
                      <ReadingGlyph kind={kind} itemKey={key} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm font-medium",
                            selected ? "text-ivory" : "text-ink",
                          )}
                        >
                          {readingName(key)}
                        </span>
                        <span
                          className={cn(
                            "block truncate text-xs",
                            selected ? "text-mist" : "text-ink-soft",
                          )}
                        >
                          {readingHint(kind, key)}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {locales.map((locale) => (
                          <LocaleChip
                            key={locale}
                            locale={locale}
                            state={readingState(entry?.[locale])}
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-3" role="status" aria-live="polite">
      <span className="sr-only">Loading readings…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-1.5">
          <Skeleton className="size-9 rounded-full" />
          <span className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
          </span>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ================================================================== editor */

interface EditorProps {
  kind: FreeReadingKind;
  itemKey: string;
  locales: Locale[];
  original: Record<Locale, ReadingDraft>;
  drafts: Record<Locale, ReadingDraft>;
  stored: Record<Locale, FreeReading | undefined>;
  errors: Record<string, string>;
  saving: boolean;
  onChange: (drafts: Record<Locale, ReadingDraft>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onBack: () => void;
}

function ReadingEditor({
  kind,
  itemKey,
  locales,
  original,
  drafts,
  stored,
  errors,
  saving,
  onChange,
  onSave,
  onDiscard,
  onBack,
}: EditorProps) {
  const changed = changedReadingLocales(original, drafts);
  const dirty = changed.length > 0;
  const name = readingName(itemKey);
  const errorLocales = [...new Set(Object.keys(errors).map((key) => key.split(".")[0]))];

  return (
    <>
      <AdminButton
        size="sm"
        variant="ghost"
        icon="chevronLeft"
        onClick={onBack}
        className="mb-2 -ms-2 lg:hidden"
      >
        All readings
      </AdminButton>
      <Panel padding="none" aria-labelledby="reading-editor-title">
        <div className="flex items-start gap-4 border-b border-stone-200/80 px-4 py-4 sm:px-5">
          <ReadingGlyph kind={kind} itemKey={itemKey} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[0.65rem] font-semibold tracking-[0.2em] text-gold-deep uppercase">
              {KIND_LABELS[kind].singular}
            </p>
            <h2
              id="reading-editor-title"
              className="font-serif text-2xl leading-tight font-semibold text-ink"
            >
              {name}
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
              {kind === "sign"
                ? `Shown to visitors born ${readingHint(kind, itemKey)}.`
                : `Shown to visitors born in a ${name} year (${readingHint(kind, itemKey).replace("Years ", "")} …).`}
            </p>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <TranslationTabs<ReadingDraft>
            value={drafts}
            onChange={(next) => onChange(next as Record<Locale, ReadingDraft>)}
            fields={["title", "body"]}
            locales={locales}
            errorLocales={errorLocales}
            missingHint="Not written yet: visitors reading in this language see the English reading instead."
          >
            {({ locale, entry, set, fieldProps }) => {
              const saved = stored[locale];
              return (
                <>
                  <Field
                    label="Title"
                    error={errors[`${locale}.title`]}
                    hint={`${(entry.title ?? "").length} / ${TITLE_MAX}`}
                  >
                    <TextInput
                      {...fieldProps}
                      value={entry.title ?? ""}
                      onChange={(event) => set("title", event.target.value)}
                      maxLength={TITLE_MAX}
                      placeholder={
                        kind === "sign" ? "e.g. Aries — the spark of beginnings" : undefined
                      }
                    />
                  </Field>
                  <Field label="Reading" error={errors[`${locale}.body`]}>
                    <MarkdownEditor
                      {...fieldProps}
                      value={entry.body ?? ""}
                      onChange={(value) => set("body", value)}
                      rows={14}
                      maxLength={BODY_MAX}
                    />
                  </Field>
                  <p className="text-xs text-ink-soft">
                    {saved?.updated_at ? (
                      <>
                        Last saved{" "}
                        <time dateTime={saved.updated_at} title={formatDateTime(saved.updated_at)}>
                          {formatRelative(saved.updated_at)}
                        </time>
                      </>
                    ) : (
                      "Never saved in this language."
                    )}
                  </p>
                </>
              );
            }}
          </TranslationTabs>
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-xl border-t border-stone-200/80 bg-stone-50/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          <p className="min-w-0 truncate text-[0.8125rem] text-ink-soft" aria-live="polite">
            {saving
              ? "Saving…"
              : dirty
                ? `Unsaved changes in ${changed.map(localeLabel).join(" and ")}`
                : "No unsaved changes"}
          </p>
          <div className="flex shrink-0 gap-2">
            <AdminButton size="sm" variant="ghost" onClick={onDiscard} disabled={!dirty || saving}>
              Discard
            </AdminButton>
            <AdminButton
              size="sm"
              variant="primary"
              onClick={onSave}
              loading={saving}
              disabled={!dirty}
              className="min-w-24"
            >
              Save reading
            </AdminButton>
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ================================================================== page */

/** /admin/free-readings — the 24 pre-written readings of the free plan, per language. */
export function FreeReadingsView() {
  const { locales } = useAdminLocales();
  const [params, setParams] = useUrlParams();
  const kindFilter = params.get("kind") ?? "";
  const missingOnly = params.get("missing") === "1";
  const selected = parseReadingId(params.get("item"));
  const selectedId = selected ? readingId(selected.kind, selected.key) : null;

  const query = useAdminQuery<AdminPage<FreeReading>>("/free-readings");
  const index = useMemo(() => indexReadings(query.data?.items ?? []), [query.data]);

  const original = useMemo(
    () => (selected && query.data ? draftsFor(index, selected.kind, selected.key, locales) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, index, locales, query.data],
  );

  // Editor drafts follow the selected reading (reset when another one is opened).
  const [editor, setEditor] = useState<{ id: string; drafts: Record<Locale, ReadingDraft> } | null>(
    null,
  );
  if (selectedId && original && editor?.id !== selectedId) {
    setEditor({ id: selectedId, drafts: original });
  }
  const drafts = editor && editor.id === selectedId ? editor.drafts : original;
  const changed = original && drafts ? changedReadingLocales(original, drafts) : [];
  const dirty = changed.length > 0;

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingItem, setPendingItem] = useState<string | null | undefined>(undefined);
  useUnsavedChanges(dirty);

  const open = (id: string | null) => {
    setErrors({});
    setEditor(null);
    setParams({ item: id });
    if (id && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      window.scrollTo({ top: 0 });
    }
  };
  const requestOpen = (id: string | null) => {
    if (id === selectedId) return;
    if (dirty) setPendingItem(id);
    else open(id);
  };

  const save = async () => {
    if (!selected || !original || !drafts || saving || !dirty) return;
    setSaving(true);
    setErrors({});
    let count = 0;
    try {
      for (const locale of changed) {
        const sent = drafts[locale];
        try {
          const saved = await adminApi.put<FreeReading>(
            `/free-readings/${selected.kind}/${selected.key}/${locale}`,
            { title: sent.title, body: sent.body },
          );
          count += 1;
          query.setData((prev) =>
            prev ? { ...prev, items: replaceReading(prev.items, saved) } : prev,
          );
          // The API trims: take its values unless the text was edited again meanwhile.
          setEditor((prev) => {
            if (!prev || prev.id !== selectedId) return prev;
            const current = prev.drafts[locale];
            if (current.title !== sent.title || current.body !== sent.body) return prev;
            return {
              ...prev,
              drafts: { ...prev.drafts, [locale]: { title: saved.title, body: saved.body } },
            };
          });
        } catch (err) {
          const error = toAdminApiError(err);
          if (error.isUnauthorized) return;
          const fields = adminFieldErrors(error);
          setErrors(
            Object.fromEntries(Object.entries(fields).map(([f, m]) => [`${locale}.${f}`, m])),
          );
          toast.error(`${localeLabel(locale)} reading was not saved`, {
            description: adminErrorMessage(error),
          });
          return;
        }
      }
      toast.success(
        `${readingName(selected.key)} saved`,
        count > 1 ? { description: `${count} languages updated.` } : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(() => void save(), dirty && !saving);

  const total = query.data ? coverage(index, locales) : null;

  return (
    <>
      <PageHeader
        title="Free readings"
        description="The pre-written readings of the free plan: one for each of the 12 Western sun signs and the 12 Chinese year animals, in every language."
        badge={
          total ? (
            <Badge tone={total.filled === total.total ? "success" : "warning"} dot>
              {total.filled}/{total.total} written
            </Badge>
          ) : null
        }
      />

      {query.error && !query.data ? (
        <Panel>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Panel>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
          <div
            className={cn(
              "min-w-0 space-y-3 lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6.5rem)] lg:flex-col",
              selectedId && "max-lg:hidden",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                label="Kind"
                value={kindFilter}
                onChange={(kind) => setParams({ kind: kind || null })}
                options={[
                  { value: "", label: "All" },
                  { value: "sign", label: "Signs" },
                  { value: "animal", label: "Animals" },
                ]}
                className="pb-0"
              />
              <ToggleChip
                pressed={missingOnly}
                onChange={(on) => setParams({ missing: on ? "1" : null })}
              >
                Incomplete only
              </ToggleChip>
            </div>
            <Panel
              padding="none"
              className="overflow-hidden lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
            >
              {query.loading ? (
                <ListSkeleton />
              ) : (
                <ReadingList
                  index={index}
                  locales={locales}
                  kindFilter={kindFilter}
                  missingOnly={missingOnly}
                  selectedId={selectedId}
                  onSelect={requestOpen}
                />
              )}
            </Panel>
          </div>

          <div className={cn("min-w-0", !selectedId && "max-lg:hidden")}>
            {selected && original && drafts ? (
              <ReadingEditor
                kind={selected.kind}
                itemKey={selected.key}
                locales={locales}
                original={original}
                drafts={drafts}
                stored={Object.fromEntries(locales.map((l) => [l, index[selectedId!]?.[l]]))}
                errors={errors}
                saving={saving}
                onChange={(next) => {
                  setEditor({ id: selectedId!, drafts: next });
                  if (Object.keys(errors).length) setErrors({});
                }}
                onSave={() => void save()}
                onDiscard={() => setEditor({ id: selectedId!, drafts: original })}
                onBack={() => requestOpen(null)}
              />
            ) : selectedId && query.loading ? (
              <Panel>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="mt-6 h-10 w-full" />
                <Skeleton className="mt-4 h-72 w-full" />
              </Panel>
            ) : (
              <Panel>
                <EmptyState
                  icon="readings"
                  title="Choose a reading"
                  description="Select a sign or an animal to edit its title and text in every language. Missing translations fall back to English."
                />
              </Panel>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingItem !== undefined}
        onClose={() => setPendingItem(undefined)}
        onConfirm={() => {
          const next = pendingItem ?? null;
          setPendingItem(undefined);
          open(next);
        }}
        tone="danger"
        title="Discard unsaved changes?"
        description={`Your edits to ${selected ? readingName(selected.key) : "this reading"} have not been saved.`}
        confirmLabel="Discard and continue"
        cancelLabel="Keep editing"
      />
    </>
  );
}
