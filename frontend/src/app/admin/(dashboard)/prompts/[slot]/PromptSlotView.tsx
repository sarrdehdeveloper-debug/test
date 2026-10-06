"use client";

import { useMemo, useState } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { Icon } from "@/components/admin/icons";
import { KeyValueList } from "@/components/admin/KeyValueList";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { Badge, StatusBadge } from "@/components/admin/StatusBadge";
import { DiffStatsLabel } from "@/components/admin/prompts/DiffView";
import {
  DraftEditor,
  draftSaveErrorMessage,
  useDraftForm,
} from "@/components/admin/prompts/DraftEditor";
import { orderedTitles, parseMinWords } from "@/components/admin/prompts/promptForm";
import { Tabs, tabPanelProps } from "@/components/admin/prompts/Tabs";
import { TemplateEditor } from "@/components/admin/prompts/TemplateEditor";
import { TryPanel } from "@/components/admin/prompts/TryPanel";
import { usedVariables } from "@/components/admin/prompts/template";
import { useUnsavedChangesGuard } from "@/components/admin/prompts/useUnsavedChangesGuard";
import { VariablesPanel } from "@/components/admin/prompts/VariablesPanel";
import { snapshotStats } from "@/components/admin/prompts/VersionChanges";
import { VersionHistory } from "@/components/admin/prompts/VersionHistory";
import { adminApi } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { formatDateTime, formatNumber } from "@/lib/admin/format";
import { useAdminLocales, useAdminMutation, useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import type {
  AdminPage,
  PromptDraftCreate,
  PromptVariable,
  PromptVariablesOut,
  PromptVersion,
  SettingsOut,
} from "@/lib/admin/types";

type Tab = "draft" | "published" | "history";
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];
const LOCALE_NAMES: Record<string, string> = { en: "English", ar: "Arabic" };

/* ================================================================== published (read-only) */

function PublishedView({
  version,
  hasDraft,
  onCreateDraft,
  creating,
  variables,
  variablesLoading,
  variablesError,
  onRetryVariables,
  globalMinWords,
}: {
  version: PromptVersion;
  hasDraft: boolean;
  onCreateDraft: () => void;
  creating: boolean;
  variables: PromptVariable[] | undefined;
  variablesLoading: boolean;
  variablesError: unknown;
  onRetryVariables: () => void;
  globalMinWords: number | null;
}) {
  const known = useMemo(
    () => (variables ? new Set(variables.map((v) => v.name)) : null),
    [variables],
  );
  const used = useMemo(
    () =>
      variables
        ? usedVariables(
            `${version.system_instruction}\n${version.template}`,
            variables.map((v) => v.name),
          )
        : new Set<string>(),
    [version, variables],
  );
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-6">
        <Panel
          title={`Version ${version.version}`}
          description="Live: every new order uses this version. Read-only — create a draft to change it."
          actions={
            hasDraft ? null : (
              <AdminButton size="sm" icon="plus" loading={creating} onClick={onCreateDraft}>
                Create draft from this
              </AdminButton>
            )
          }
        >
          <KeyValueList
            items={[
              { label: "Internal name", value: version.name },
              ...orderedTitles(version.section_titles).map(([locale, title]) => ({
                label: `Section title · ${LOCALE_NAMES[locale] ?? locale}`,
                value: (
                  <span lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
                    {title}
                  </span>
                ),
              })),
              {
                label: "Minimum words",
                value:
                  version.min_words === null
                    ? `Global setting${globalMinWords !== null ? ` (${formatNumber(globalMinWords)})` : ""}`
                    : `${formatNumber(version.min_words)} words`,
              },
              {
                label: "Published",
                value: version.published_at ? formatDateTime(version.published_at) : null,
              },
              {
                label: "Created",
                value: `${formatDateTime(version.created_at)}${version.created_by_name ? ` by ${version.created_by_name}` : ""}`,
              },
              {
                label: "Notes",
                value: version.notes ? (
                  <span className="whitespace-pre-wrap">{version.notes}</span>
                ) : null,
                hideEmpty: true,
              },
            ]}
          />
        </Panel>
        <Panel title="System instruction">
          <TemplateEditor
            aria-label="System instruction (read-only)"
            value={version.system_instruction}
            readOnly
            known={known}
            minLines={3}
            maxHeightClassName="max-h-[28rem]"
          />
        </Panel>
        <Panel title="Template">
          <TemplateEditor
            aria-label="Template (read-only)"
            value={version.template}
            readOnly
            known={known}
            minLines={3}
          />
        </Panel>
        <TryPanel idBase="try-published" versionId={version.id} />
      </div>
      <aside className="min-w-0 xl:sticky xl:top-20 xl:flex xl:max-h-[calc(100dvh-6rem)] xl:flex-col">
        <VariablesPanel
          className="xl:min-h-0 xl:flex-1"
          variables={variables}
          loading={variablesLoading}
          error={variablesError}
          onRetry={onRetryVariables}
          used={used}
        />
      </aside>
    </div>
  );
}

/* ================================================================== page */

function SlotSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading prompt…</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-80 max-w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl max-xl:hidden" />
      </div>
    </div>
  );
}

/** `/admin/prompts/[slot]`: draft editor, published version, history and diff of one prompt. */
export function PromptSlotView({ slot }: { slot: number }) {
  const [params, setParams] = useUrlParams();
  const { locales } = useAdminLocales();

  const versionsQuery = useAdminQuery<AdminPage<PromptVersion>>(`/prompts/${slot}/versions`, {
    query: { page_size: 100 },
    keepPreviousData: false,
  });
  const variablesQuery = useAdminQuery<PromptVariablesOut>("/prompts/variables", {
    query: { locale: "en" },
  });
  const settingsQuery = useAdminQuery<SettingsOut>("/settings");
  const globalMinWords = settingsQuery.data?.values.min_words ?? null;

  const versions = useMemo(() => versionsQuery.data?.items ?? [], [versionsQuery.data]);
  const published = versions.find((v) => v.status === "published") ?? null;
  const draft = versions.find((v) => v.status === "draft") ?? null;

  const draftState = useDraftForm(draft, locales, (saved) =>
    versionsQuery.setData((prev) =>
      prev ? { ...prev, items: prev.items.map((v) => (v.id === saved.id ? saved : v)) } : prev,
    ),
  );
  useUnsavedChangesGuard(draftState.dirty);

  const rawTab = params.get("tab");
  const tab: Tab =
    rawTab === "published" || rawTab === "history" || rawTab === "draft"
      ? rawTab
      : draft || !published
        ? "draft"
        : "published";
  const setTab = (next: Tab) => setParams({ tab: next });

  const [dialog, setDialog] = useState<"publish" | "discard" | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<PromptVersion | null>(null);

  const refresh = () => versionsQuery.refetch();
  const create = useAdminMutation(
    (body: PromptDraftCreate) => adminApi.post<PromptVersion>(`/prompts/${slot}/versions`, body),
    {
      successMessage: (version) => `Draft v${version.version} created`,
      onSuccess: async () => {
        await refresh();
        setTab("draft");
      },
      onError: (error) => {
        if (error.code === "draft_exists") void refresh();
      },
    },
  );
  const publish = useAdminMutation(
    (version: PromptVersion) =>
      adminApi.post<PromptVersion>(`/prompts/versions/${version.id}/publish`),
    {
      errorMessage: false, // shown in the confirmation dialog
      successMessage: (version) =>
        `Version ${version.version} is live. New orders use it from now on.`,
      onSuccess: async () => {
        await refresh();
        setTab("published");
      },
      onError: (error) => {
        if (error.isConflict || error.isNotFound) void refresh();
      },
    },
  );
  const discard = useAdminMutation(
    (version: PromptVersion) => adminApi.delete<void>(`/prompts/versions/${version.id}`),
    {
      errorMessage: false,
      successMessage: "Draft discarded",
      onSuccess: async () => {
        await refresh();
        setTab("published");
      },
      onError: (error) => {
        if (error.isConflict || error.isNotFound) void refresh();
      },
    },
  );

  const breadcrumbs = [{ label: "Prompts", href: "/admin/prompts" }, { label: `Section ${slot}` }];

  if (versionsQuery.loading) return <SlotSkeleton />;
  if (versionsQuery.error && !versionsQuery.data) {
    return (
      <>
        <PageHeader title={`Section ${slot}`} breadcrumbs={breadcrumbs} />
        <Panel>
          <ErrorState error={versionsQuery.error} onRetry={() => void refresh()} />
        </Panel>
      </>
    );
  }

  const current = draft ?? published;
  const titleEn = (published ?? draft)?.section_titles.en;
  const minWords = draftState.form ? parseMinWords(draftState.form.min_words) : undefined;
  const publishStats =
    draft && published && draftState.form
      ? snapshotStats(
          { ...published, label: "published" },
          {
            ...draftState.form,
            label: "draft",
            min_words: minWords === undefined ? draft.min_words : minWords,
          },
        )
      : null;

  const variables = variablesQuery.data?.items;
  const variablesProps = {
    variables,
    variablesLoading: variablesQuery.loading,
    variablesError: variablesQuery.error,
    onRetryVariables: () => void variablesQuery.refetch(),
  };

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={current?.name ?? `Section ${slot}`}
        badge={<Badge tone="navy">Section {slot}</Badge>}
        description={
          titleEn
            ? `Writes “${titleEn}”, the ${ORDINALS[slot - 1]} section of every report.`
            : `Writes the ${ORDINALS[slot - 1]} section of every report.`
        }
        actions={
          <>
            <nav aria-label="Sections" className="flex items-center">
              {slot > 1 ? (
                <AdminButtonLink
                  href={`/admin/prompts/${slot - 1}`}
                  size="sm"
                  variant="ghost"
                  icon="chevronLeft"
                  iconOnly
                >
                  {`Previous: section ${slot - 1}`}
                </AdminButtonLink>
              ) : (
                <AdminButton size="sm" variant="ghost" icon="chevronLeft" iconOnly disabled>
                  No previous section
                </AdminButton>
              )}
              {slot < 6 ? (
                <AdminButtonLink
                  href={`/admin/prompts/${slot + 1}`}
                  size="sm"
                  variant="ghost"
                  icon="chevronRight"
                  iconOnly
                >
                  {`Next: section ${slot + 1}`}
                </AdminButtonLink>
              ) : (
                <AdminButton size="sm" variant="ghost" icon="chevronRight" iconOnly disabled>
                  No next section
                </AdminButton>
              )}
            </nav>
            {draft ? (
              <>
                <AdminButton
                  size="sm"
                  variant="dangerGhost"
                  icon="trash"
                  onClick={() => setDialog("discard")}
                >
                  Discard draft
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="gold"
                  icon="check"
                  onClick={() => setDialog("publish")}
                >
                  Publish draft
                </AdminButton>
              </>
            ) : (
              <AdminButton
                size="sm"
                variant="primary"
                icon="plus"
                loading={create.pending}
                onClick={() => void create.mutate({})}
              >
                Create draft
              </AdminButton>
            )}
          </>
        }
      />

      {!published ? (
        <p
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          This section has no published version, so paid reports cannot be generated. Publish a
          version as soon as possible.
        </p>
      ) : null}

      <Tabs
        label="Prompt versions"
        idBase="prompt"
        panelPerTab
        value={tab}
        onChange={setTab}
        className="mb-6"
        items={[
          {
            value: "draft",
            label: (
              <>
                Draft
                {draft ? <span className="font-normal text-ink-soft">v{draft.version}</span> : null}
                {draftState.dirty ? (
                  <span className="size-1.5 rounded-full bg-warning" title="Unsaved changes">
                    <span className="sr-only">(unsaved changes)</span>
                  </span>
                ) : null}
              </>
            ),
          },
          {
            value: "published",
            label: (
              <>
                Published
                {published ? (
                  <span className="font-normal text-ink-soft">v{published.version}</span>
                ) : null}
              </>
            ),
            disabled: !published,
          },
          { value: "history", label: "History", count: versions.length },
        ]}
      />

      <div
        {...tabPanelProps("prompt", "draft", true)}
        hidden={tab !== "draft"}
        className="focus:outline-none"
      >
        {draft ? (
          <DraftEditor
            draft={draft}
            published={published}
            state={draftState}
            locales={locales}
            globalMinWords={globalMinWords}
            {...variablesProps}
          />
        ) : (
          <Panel>
            <EmptyState
              icon="prompts"
              title="No draft"
              description={
                published
                  ? `Changes are made in a draft. It starts as a copy of the published version (v${published.version}); publish it when you are happy with the preview and the AI test.`
                  : "Create the first version of this prompt."
              }
              action={
                <>
                  <AdminButton
                    variant="primary"
                    icon="plus"
                    loading={create.pending}
                    onClick={() => void create.mutate({})}
                  >
                    {published ? `Create draft from v${published.version}` : "Create draft"}
                  </AdminButton>
                  {versions.length > 1 ? (
                    <AdminButton onClick={() => setTab("history")}>
                      Start from an older version
                    </AdminButton>
                  ) : null}
                </>
              }
            />
          </Panel>
        )}
      </div>

      <div
        {...tabPanelProps("prompt", "published", true)}
        hidden={tab !== "published"}
        className="focus:outline-none"
      >
        {published ? (
          <PublishedView
            version={published}
            hasDraft={Boolean(draft)}
            onCreateDraft={() => void create.mutate({ base_version_id: published.id })}
            creating={create.pending}
            globalMinWords={globalMinWords}
            {...variablesProps}
          />
        ) : null}
      </div>

      <div
        {...tabPanelProps("prompt", "history", true)}
        hidden={tab !== "history"}
        className="focus:outline-none"
      >
        <VersionHistory
          versions={versions}
          published={published}
          draft={draft}
          globalMinWords={globalMinWords}
          creating={create.pending}
          onRestore={(version) => setRestoreTarget(version)}
          onDraftFrom={(version) => void create.mutate({ base_version_id: version.id })}
        />
      </div>

      {draft ? (
        <ConfirmDialog
          open={dialog === "publish"}
          onClose={() => setDialog(null)}
          title={`Publish draft v${draft.version}?`}
          description="New orders use it immediately: every report generated from now on is written with this version."
          confirmLabel={draftState.dirty ? "Save and publish" : "Publish"}
          formatError={draftSaveErrorMessage}
          onConfirm={async () => {
            await draftState.save();
            await publish.mutateAsync(draft);
          }}
        >
          <ul className="space-y-2 text-ink-soft">
            {published ? (
              <li>
                The current version (v{published.version}) is archived. You can publish it again
                from History at any time.
              </li>
            ) : null}
            <li>Orders that were already generated keep the versions they used.</li>
            {draftState.dirty ? (
              <li className="font-medium text-ink">Your unsaved changes are saved first.</li>
            ) : null}
          </ul>
          {publishStats ? (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-stone-50 px-3 py-2 text-[0.8125rem] text-ink-soft">
              <span className="flex items-center gap-1.5">
                Template <DiffStatsLabel stats={publishStats.template} />
              </span>
              <span className="flex items-center gap-1.5">
                System instruction <DiffStatsLabel stats={publishStats.system} />
              </span>
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {draft ? (
        <ConfirmDialog
          open={dialog === "discard"}
          onClose={() => setDialog(null)}
          tone="danger"
          title={`Discard draft v${draft.version}?`}
          description="The draft and its changes are deleted. The published version is not affected."
          confirmLabel="Discard draft"
          formatError={(err) => adminErrorMessage(err)}
          onConfirm={async () => {
            await discard.mutateAsync(draft);
            draftState.reset();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        title={restoreTarget ? `Publish v${restoreTarget.version} again?` : "Publish again?"}
        description="New orders use it immediately (a roll back)."
        confirmLabel="Publish again"
        formatError={(err) => adminErrorMessage(err)}
        onConfirm={() => (restoreTarget ? publish.mutateAsync(restoreTarget) : undefined)}
      >
        {restoreTarget ? (
          <ul className="space-y-2 text-ink-soft">
            {published ? <li>The current version (v{published.version}) is archived.</li> : null}
            {draft ? <li>Your draft (v{draft.version}) is kept.</li> : null}
            <li>
              <StatusBadge kind="prompt" status={restoreTarget.status} /> {restoreTarget.name}
            </li>
          </ul>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
