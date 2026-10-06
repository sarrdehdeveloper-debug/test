"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { Badge } from "@/components/admin/StatusBadge";
import { SearchInput } from "@/components/admin/Toolbar";
import { ContentKeyRow } from "@/components/admin/content/ContentKeyRow";
import { FilterChips, ToggleChip } from "@/components/admin/content/FilterChips";
import { refreshPublicSite } from "@/components/admin/content/publicRefresh";
import { SaveBar } from "@/components/admin/content/SaveBar";
import {
  applySaved,
  changedItems,
  changeSummary,
  countChanges,
  filterKeys,
  groupKeys,
  untranslatedCount,
  type ContentByLocale,
  type ContentValues,
} from "@/components/admin/content/siteContent";
import { useSaveShortcut } from "@/components/admin/content/useSaveShortcut";
import { useUnsavedChanges } from "@/components/admin/content/useUnsavedChanges";
import { adminApi, isAbortError, toAdminApiError, type AdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { useAdminLocales, useUrlParams } from "@/lib/admin/hooks";
import { toast } from "@/lib/admin/toast";
import { localeLabel } from "@/lib/admin/translations";
import type { ContentKey, Locale, SiteContentAdminOut } from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";

/* ================================================================== state */

interface State {
  /** Request key of the loaded data (`locales` + reload nonce). */
  loadedKey: string | null;
  error: AdminApiError | null;
  keys: ContentKey[];
  originals: ContentByLocale;
  drafts: ContentByLocale;
  /** Save errors: locale → key → message. */
  errors: Record<Locale, Record<string, string>>;
}

type Action =
  | { type: "loaded"; key: string; responses: SiteContentAdminOut[] }
  | { type: "failed"; key: string; error: AdminApiError }
  | { type: "edit"; locale: Locale; key: string; value: string }
  | { type: "saved"; locale: Locale; sent: ContentValues; response: SiteContentAdminOut }
  | { type: "saveErrors"; locale: Locale; errors: Record<string, string> }
  | { type: "discard" };

const INITIAL: State = {
  loadedKey: null,
  error: null,
  keys: [],
  originals: {},
  drafts: {},
  errors: {},
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded": {
      const originals: ContentByLocale = {};
      for (const response of action.responses) originals[response.locale] = response.items;
      return {
        loadedKey: action.key,
        error: null,
        keys: action.responses[0]?.keys ?? [],
        originals,
        drafts: originals,
        errors: {},
      };
    }
    case "failed":
      return { ...state, loadedKey: action.key, error: action.error };
    case "edit": {
      const localeErrors = state.errors[action.locale];
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.locale]: { ...state.drafts[action.locale], [action.key]: action.value },
        },
        errors:
          localeErrors?.[action.key] !== undefined
            ? {
                ...state.errors,
                [action.locale]: Object.fromEntries(
                  Object.entries(localeErrors).filter(([k]) => k !== action.key),
                ),
              }
            : state.errors,
      };
    }
    case "saved":
      return {
        ...state,
        originals: { ...state.originals, [action.locale]: action.response.items },
        drafts: {
          ...state.drafts,
          [action.locale]: applySaved(
            state.drafts[action.locale] ?? {},
            action.sent,
            action.response.items,
          ),
        },
        errors: { ...state.errors, [action.locale]: {} },
      };
    case "saveErrors":
      return { ...state, errors: { ...state.errors, [action.locale]: action.errors } };
    case "discard":
      return { ...state, drafts: state.originals, errors: {} };
    default:
      return state;
  }
}

/** `items.home.hero.title` (422 details) → `{ "home.hero.title": message }`. */
function itemErrors(error: AdminApiError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(error.fields)) {
    const key = field.startsWith("items.") ? field.slice("items.".length) : null;
    if (key) out[key] = message.replace(/^Value error,\s*/i, "");
  }
  return out;
}

/* ================================================================== view */

function LoadingPanels() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Loading site content…</span>
      {[0, 1].map((panel) => (
        <div key={panel} className="rounded-xl border border-stone-200 bg-white">
          <div className="border-b border-stone-200/80 px-5 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-72 max-w-full" />
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className="border-b border-stone-100 px-5 py-4 last:border-0">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="mt-1.5 h-3 w-32" />
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** /admin/content — every editable text of the public site, side by side per language. */
export function SiteContentView() {
  const { locales, defaultLocale } = useAdminLocales();
  const [params, setParams] = useUrlParams();
  const query = params.get("q") ?? "";
  const group = params.get("group") ?? "";
  const untranslatedOnly = params.get("filter") === "untranslated";
  const changedOnly = params.get("filter") === "changed";

  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [nonce, setNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestKey = `${locales.join(",")}#${nonce}`;
  const loading = state.loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      locales.map((locale) =>
        adminApi.get<SiteContentAdminOut>("/site-content", {
          query: { locale },
          signal: controller.signal,
        }),
      ),
    ).then(
      (responses) => dispatch({ type: "loaded", key: requestKey, responses }),
      (err: unknown) => {
        if (!isAbortError(err)) {
          dispatch({ type: "failed", key: requestKey, error: toAdminApiError(err) });
        }
      },
    );
    return () => controller.abort();
    // `locales` is part of requestKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const counts = useMemo(
    () => countChanges(state.originals, state.drafts, locales),
    [state.originals, state.drafts, locales],
  );
  const totalChanges = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const dirty = totalChanges > 0;
  useUnsavedChanges(dirty);

  const onChange = useCallback(
    (locale: Locale, key: string, value: string) => dispatch({ type: "edit", locale, key, value }),
    [dispatch],
  );

  const save = useCallback(async () => {
    if (saving) return;
    const pending = locales
      .map((locale) => ({
        locale,
        items: changedItems(state.originals[locale] ?? {}, state.drafts[locale] ?? {}),
      }))
      .filter((entry) => Object.keys(entry.items).length > 0);
    if (!pending.length) return;
    setSaving(true);
    let saved = 0;
    try {
      for (const { locale, items } of pending) {
        try {
          const response = await adminApi.put<SiteContentAdminOut>("/site-content", {
            locale,
            items,
          });
          dispatch({ type: "saved", locale, sent: items, response });
          saved += Object.keys(items).length;
        } catch (err) {
          const error = toAdminApiError(err);
          if (error.isUnauthorized) return;
          const fieldErrors = itemErrors(error);
          if (Object.keys(fieldErrors).length) {
            dispatch({ type: "saveErrors", locale, errors: fieldErrors });
            const first = Object.keys(fieldErrors)[0];
            document.getElementById(`key-${first}`)?.scrollIntoView({ block: "center" });
          }
          toast.error(`${localeLabel(locale)} changes were not saved`, {
            description: adminErrorMessage(error),
          });
          return;
        }
      }
    } finally {
      setSaving(false);
      if (saved > 0) refreshPublicSite(CACHE_TAGS.siteContent);
    }
    toast.success(saved === 1 ? "1 change saved" : `${saved} changes saved`, {
      description: "The public site shows them within about a minute.",
    });
  }, [locales, saving, state.drafts, state.originals]);

  useSaveShortcut(() => void save(), dirty && !saving);

  const filter = { query, group, untranslated: untranslatedOnly, changed: changedOnly };
  const visibleKeys = useMemo(
    () => filterKeys(state.keys, filter, state.originals, state.drafts, locales),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.keys,
      query,
      group,
      untranslatedOnly,
      changedOnly,
      state.originals,
      state.drafts,
      locales,
    ],
  );
  const groups = useMemo(() => groupKeys(visibleKeys), [visibleKeys]);
  const allGroups = useMemo(() => groupKeys(state.keys), [state.keys]);
  const untranslated = useMemo(
    () => untranslatedCount(state.keys, state.drafts, locales),
    [state.keys, state.drafts, locales],
  );
  const changedKeys = useMemo(
    () =>
      state.keys.filter((key) =>
        locales.some(
          (locale) =>
            (state.originals[locale]?.[key.key] ?? "") !== (state.drafts[locale]?.[key.key] ?? ""),
        ),
      ).length,
    [state.keys, state.originals, state.drafts, locales],
  );
  const filtersActive = Boolean(query || group || untranslatedOnly || changedOnly);

  const header = (
    <PageHeader
      title="Site content"
      description={
        <>
          Headlines, texts and legal pages of the public site, edited side by side in every
          language. Saved changes appear on the site within about a minute.
        </>
      }
      actions={
        <AdminButtonLink href="/en" external size="sm" icon="external">
          View site
        </AdminButtonLink>
      }
      badge={
        !loading && state.keys.length ? (
          untranslated ? (
            <Badge tone="warning" dot>
              {untranslated} untranslated
            </Badge>
          ) : (
            <Badge tone="success" dot>
              Fully translated
            </Badge>
          )
        ) : null
      }
    />
  );

  if (state.error && !state.keys.length) {
    return (
      <>
        {header}
        <Panel>
          <ErrorState error={state.error} onRetry={() => setNonce((n) => n + 1)} />
        </Panel>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={(q) => setParams({ q })}
            placeholder="Search keys, descriptions or text"
            label="Search site content"
            className="sm:w-80"
          />
          <ToggleChip
            pressed={untranslatedOnly}
            onChange={(on) => setParams({ filter: on ? "untranslated" : null })}
            count={loading ? undefined : untranslated}
          >
            Untranslated
          </ToggleChip>
          <ToggleChip
            pressed={changedOnly}
            onChange={(on) => setParams({ filter: on ? "changed" : null })}
            count={loading ? undefined : changedKeys}
          >
            Unsaved
          </ToggleChip>
          {filtersActive ? (
            <AdminButton
              size="sm"
              variant="ghost"
              icon="close"
              onClick={() => setParams({ q: null, group: null, filter: null })}
            >
              Clear filters
            </AdminButton>
          ) : null}
        </div>
        <FilterChips
          label="Section"
          value={group}
          onChange={(value) => setParams({ group: value || null })}
          options={[
            { value: "", label: "All sections", count: loading ? undefined : state.keys.length },
            ...allGroups.map((g) => ({ value: g.group, label: g.label, count: g.keys.length })),
          ]}
        />
      </div>

      {loading && !state.keys.length ? (
        <LoadingPanels />
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon="search"
            title="No texts match"
            description="Try another search or clear the filters."
            action={
              <AdminButton
                size="sm"
                onClick={() => setParams({ q: null, group: null, filter: null })}
              >
                Clear filters
              </AdminButton>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-5" aria-busy={loading || undefined}>
          {groups.map((section) => (
            <Panel
              key={section.group}
              id={`group-${section.group}`}
              padding="none"
              title={section.label}
              description={section.description}
              actions={
                <span className="text-xs text-ink-soft tabular-nums">
                  {section.keys.length} {section.keys.length === 1 ? "text" : "texts"}
                </span>
              }
              className="scroll-mt-24"
            >
              <div className="divide-y divide-stone-100">
                {section.keys.map((key) => (
                  <ContentKeyRow
                    key={key.key}
                    contentKey={key}
                    locales={locales}
                    defaultLocale={defaultLocale}
                    values={Object.fromEntries(
                      locales.map((l) => [l, state.drafts[l]?.[key.key] ?? ""]),
                    )}
                    saved={Object.fromEntries(
                      locales.map((l) => [l, state.originals[l]?.[key.key] ?? ""]),
                    )}
                    errors={Object.fromEntries(locales.map((l) => [l, state.errors[l]?.[key.key]]))}
                    onChange={onChange}
                    disabled={saving}
                  />
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <SaveBar
        dirty={dirty}
        saving={saving}
        status={
          <>
            {totalChanges} unsaved {totalChanges === 1 ? "change" : "changes"}
            <span className="font-normal text-ink-soft max-sm:hidden">
              {" "}
              · {changeSummary(counts, localeLabel)}
            </span>
          </>
        }
        onSave={() => void save()}
        onDiscard={() => setConfirmDiscard(true)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          dispatch({ type: "discard" });
          setConfirmDiscard(false);
        }}
        tone="danger"
        title="Discard unsaved changes?"
        description={`${totalChanges} edited ${totalChanges === 1 ? "text goes" : "texts go"} back to the saved version.`}
        confirmLabel="Discard changes"
      />
    </>
  );
}
