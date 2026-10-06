"use client";

import { useState } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { Panel } from "@/components/admin/Panel";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import type { PromptVersion } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { VersionChanges } from "./VersionChanges";

export interface VersionHistoryProps {
  /** All versions of the slot, newest first. */
  versions: PromptVersion[];
  published: PromptVersion | null;
  draft: PromptVersion | null;
  globalMinWords: number | null;
  /** Publish an archived version again (roll back). */
  onRestore: (version: PromptVersion) => void;
  /** Start a new draft from a version (only when there is no draft). */
  onDraftFrom: (version: PromptVersion) => void;
  creating?: boolean;
}

function versionLabel(version: PromptVersion): string {
  const status =
    version.status === "published"
      ? "published"
      : version.status === "draft"
        ? "draft"
        : "archived";
  return `v${version.version} (${status})`;
}

/** Version list of a slot with a comparison of any two versions and restore / draft-from actions. */
export function VersionHistory({
  versions,
  published,
  draft,
  globalMinWords,
  onRestore,
  onDraftFrom,
  creating = false,
}: VersionHistoryProps) {
  const fallback = draft ?? versions.find((v) => v.status !== "published") ?? versions[0] ?? null;
  // null = not chosen yet: follow the default (the draft once one exists).
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = versions.find((v) => v.id === selectedId) ?? fallback;
  const defaultOther = (target: PromptVersion | null) => {
    if (!target) return null;
    if (published && published.id !== target.id) return published;
    // The published one itself: compare with the version before it, else the newest other one.
    return (
      versions.find((v) => v.version < target.version) ??
      versions.find((v) => v.id !== target.id) ??
      null
    );
  };
  const [otherId, setOtherId] = useState<number | null>(null);
  const other =
    (otherId !== null ? versions.find((v) => v.id === otherId && v.id !== selected?.id) : null) ??
    defaultOther(selected);
  // Always read the diff from the older to the newer version.
  const [older, newer] =
    selected && other
      ? other.version < selected.version
        ? [other, selected]
        : [selected, other]
      : [null, null];

  if (!versions.length) {
    return (
      <Panel>
        <p className="text-sm text-ink-soft">No versions yet.</p>
      </Panel>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <Panel
        title="Versions"
        description={`${versions.length} in total, newest first.`}
        padding="none"
      >
        <ul className="max-h-[36rem] divide-y divide-stone-100 overflow-y-auto">
          {versions.map((version) => {
            const active = version.id === selected?.id;
            return (
              <li key={version.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedId(version.id);
                    setOtherId(null);
                  }}
                  className={cn(
                    "block w-full px-4 py-3 text-start transition-colors sm:px-5",
                    active ? "bg-gold-pale/40" : "hover:bg-ivory",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">
                      v{version.version}
                    </span>
                    <StatusBadge kind="prompt" status={version.status} />
                  </span>
                  <span className="mt-1 block truncate text-[0.8125rem] text-ink">
                    {version.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {version.created_by_name ?? "System"} · {formatDate(version.created_at)}
                    {version.published_at ? ` · published ${formatDate(version.published_at)}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {selected ? (
        <Panel
          title={`Version ${selected.version}`}
          description={
            <>
              {selected.name} · created {formatDateTime(selected.created_at)}
              {selected.created_by_name ? ` by ${selected.created_by_name}` : ""}
              {selected.published_at ? ` · published ${formatDateTime(selected.published_at)}` : ""}
            </>
          }
          actions={
            <>
              {selected.status === "archived" ? (
                <AdminButton size="sm" icon="refresh" onClick={() => onRestore(selected)}>
                  Publish again
                </AdminButton>
              ) : null}
              {selected.status !== "draft" ? (
                <AdminButton
                  size="sm"
                  icon="plus"
                  disabled={Boolean(draft)}
                  loading={creating}
                  title={draft ? "Publish or discard the current draft first" : undefined}
                  onClick={() => onDraftFrom(selected)}
                >
                  New draft from v{selected.version}
                </AdminButton>
              ) : null}
            </>
          }
        >
          {selected.notes ? (
            <p className="mb-4 rounded-lg bg-stone-50 px-3 py-2.5 text-[0.8125rem] whitespace-pre-wrap text-ink-soft">
              <span className="font-medium text-ink">Notes: </span>
              {selected.notes}
            </p>
          ) : null}
          {versions.length > 1 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-soft">
              <label htmlFor="compare-base">Compare with</label>
              <select
                id="compare-base"
                value={other?.id ?? ""}
                onChange={(event) => setOtherId(Number(event.target.value) || null)}
                className="h-8 rounded-md border border-stone-300 bg-white px-2 text-[0.8125rem] text-ink focus:border-gold-bright focus:ring-3 focus:ring-gold-light/40 focus:outline-none"
              >
                {versions
                  .filter((v) => v.id !== selected.id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {versionLabel(v)}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          {older && newer ? (
            <VersionChanges
              before={{ ...older, label: versionLabel(older) }}
              after={{ ...newer, label: versionLabel(newer) }}
              globalMinWords={globalMinWords}
            />
          ) : (
            <p className="text-sm text-ink-soft">This is the only version of this prompt.</p>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
