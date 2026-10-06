"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { FormSection } from "@/components/admin/FormSection";
import { Icon } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { refreshPublicContent } from "@/components/admin/content/revalidate";
import { useUnsavedChangesGuard } from "@/components/admin/prompts/useUnsavedChangesGuard";
import {
  changedSettings,
  dirtySettingKeys,
  invalidSettingMessage,
  parseSettingsDraft,
  SETTING_FIELD_BY_KEY,
  SETTING_GROUPS,
  settingKeyFromMessage,
  settingsToDraft,
  type SettingErrors,
  type SettingKey,
  type SettingsDraft,
} from "@/components/admin/settings/schema";
import { SettingField } from "@/components/admin/settings/SettingField";
import { adminApi } from "@/lib/admin/api";
import { formatRelative } from "@/lib/admin/format";
import { useAdminMutation, useAdminQuery } from "@/lib/admin/hooks";
import { CACHE_TAGS } from "@/lib/api/tags";
import type {
  AdminPage,
  AuditLogEntry,
  BusinessSettings,
  SettingsOut,
  SettingsUpdate,
} from "@/lib/admin/types";

/** Settings shown on the public site (`GET /public-config`): their cache is refreshed after a save. */
const PUBLIC_KEYS: SettingKey[] = ["paid_price_cents", "currency", "report_access_hours"];
const WIDE_KINDS = new Set(["boolean", "choice"]);

function SettingsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">Loading settings…</span>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** `/admin/settings` (managers): every business setting, grouped, with a sticky save bar. */
export function SettingsView() {
  const query = useAdminQuery<SettingsOut>("/settings");
  const lastChange = useAdminQuery<AdminPage<AuditLogEntry>>("/audit-logs", {
    query: { entity_type: "settings", page_size: 1 },
  });

  // Draft = editable copy of the saved values (re-synced when the saved values change and the
  // admin has no pending edits).
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [basedOn, setBasedOn] = useState<BusinessSettings | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{
    key: SettingKey | null;
    message: string;
  } | null>(null);

  const saved = query.data?.values ?? null;
  const defaults = query.data?.defaults ?? null;
  const defaultDrafts = useMemo(() => (defaults ? settingsToDraft(defaults) : null), [defaults]);
  const dirtyKeys = useMemo(
    () => (draft && basedOn ? dirtySettingKeys(draft, basedOn) : []),
    [draft, basedOn],
  );
  if (saved && saved !== basedOn && (!draft || dirtyKeys.length === 0)) {
    setBasedOn(saved);
    setDraft(settingsToDraft(saved));
  }
  const dirty = dirtyKeys.length > 0;
  useUnsavedChangesGuard(dirty);

  const parsed = useMemo(() => (draft ? parseSettingsDraft(draft) : null), [draft]);
  const visibleErrors: SettingErrors = {};
  if (parsed) {
    for (const [key, message] of Object.entries(parsed.errors) as Array<[SettingKey, string]>) {
      if (submitted || dirtyKeys.includes(key)) visibleErrors[key] = message;
    }
  }
  if (serverError?.key)
    visibleErrors[serverError.key] ??= invalidSettingMessage(serverError.message);

  const save = useAdminMutation(
    (body: SettingsUpdate) => adminApi.put<SettingsOut>("/settings", body),
    {
      errorMessage: (error) => (error.code === "invalid_setting" ? null : undefined),
      onSuccess: (out, body) => {
        query.setData(out);
        setBasedOn(out.values);
        setDraft(settingsToDraft(out.values));
        setSubmitted(false);
        setServerError(null);
        void lastChange.refetch();
        const keys = Object.keys(body.values) as SettingKey[];
        if (keys.some((key) => PUBLIC_KEYS.includes(key))) {
          void refreshPublicContent([CACHE_TAGS.publicConfig]).catch(() => undefined);
        }
      },
      successMessage: (_out, body) => {
        const labels = (Object.keys(body.values) as SettingKey[]).map(
          (key) => SETTING_FIELD_BY_KEY[key].label,
        );
        return labels.length === 1 ? `Saved: ${labels[0]}` : `${labels.length} settings saved`;
      },
      onError: (error) => {
        if (error.code === "invalid_setting") {
          const key = settingKeyFromMessage(error.message);
          setServerError({ key, message: error.message });
          // Bring the rejected field (or the banner above the form) into view.
          window.requestAnimationFrame(() =>
            document
              .getElementById(key ? `setting-${key}` : "settings-error")
              ?.scrollIntoView({ block: "center", behavior: "smooth" }),
          );
        }
      },
    },
  );

  const update = (key: SettingKey, value: SettingsDraft[SettingKey]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (serverError?.key === key) setServerError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!parsed || !basedOn || save.pending) return;
    setSubmitted(true);
    if (Object.keys(parsed.errors).length) {
      const first = SETTING_GROUPS.flatMap((g) => g.fields).find((f) => parsed.errors[f.key]);
      if (first)
        document
          .getElementById(`setting-${first.key}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const values = changedSettings(parsed.values, basedOn);
    if (!Object.keys(values).length) return;
    setServerError(null);
    void save.mutate({ values });
  };

  const discard = () => {
    if (!basedOn) return;
    setDraft(settingsToDraft(basedOn));
    setSubmitted(false);
    setServerError(null);
  };

  const last = lastChange.data?.items[0];
  const currencyDraft =
    typeof draft?.currency === "string" ? draft.currency.trim().toUpperCase() : "";
  const currency = /^[A-Z]{3}$/.test(currencyDraft) ? currencyDraft : (saved?.currency ?? "USD");

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business rules of the site and the report pipeline. A saved change applies at once to new orders and readings; existing orders are not changed."
        actions={
          <Link
            href="/admin/audit?entity_type=settings"
            className="inline-flex items-center gap-1.5 rounded-md text-[0.8125rem] text-ink-soft hover:text-ink"
          >
            <Icon name="audit" className="size-4" />
            {last ? (
              <span>
                Last changed {formatRelative(last.created_at)}
                {last.user_email ? ` by ${last.user_email}` : ""}
              </span>
            ) : (
              <span>Change history</span>
            )}
          </Link>
        }
      />

      {query.error && !query.data ? (
        <Panel>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Panel>
      ) : !draft || !defaults || !defaultDrafts ? (
        <SettingsSkeleton />
      ) : (
        <form onSubmit={submit} noValidate>
          {serverError ? (
            <p
              id="settings-error"
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger"
            >
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <span>The settings were not saved. {invalidSettingMessage(serverError.message)}</span>
            </p>
          ) : null}

          <div className="space-y-8">
            {SETTING_GROUPS.map((group) => (
              <FormSection
                key={group.id}
                id={`settings-${group.id}`}
                title={group.title}
                description={group.description}
              >
                <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                  {group.fields.map((field) => (
                    <div
                      key={field.key}
                      id={`setting-${field.key}`}
                      className={
                        WIDE_KINDS.has(field.kind) || field.kind === "text"
                          ? "md:col-span-2"
                          : undefined
                      }
                    >
                      <SettingField
                        field={field}
                        value={draft[field.key]}
                        defaultValue={defaults[field.key]}
                        defaultDraft={defaultDrafts[field.key]}
                        changed={dirtyKeys.includes(field.key)}
                        error={visibleErrors[field.key]}
                        currency={currency}
                        disabled={save.pending}
                        onChange={(value) => update(field.key, value)}
                      />
                    </div>
                  ))}
                </div>
              </FormSection>
            ))}

            <p className="flex items-start gap-2 text-[0.8125rem] text-ink-soft lg:ps-[calc(17rem+2rem)]">
              <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-gold-deep" />
              <span>
                Every save is recorded in the{" "}
                <Link
                  href="/admin/audit?entity_type=settings"
                  className="font-medium text-ink underline decoration-gold/50 underline-offset-2 hover:decoration-gold"
                >
                  audit log
                </Link>{" "}
                with the old and new values and who made the change.
              </span>
            </p>
          </div>

          {dirty || save.pending ? (
            <div className="pointer-events-none sticky bottom-4 z-20 mt-6 flex">
              <div
                role="region"
                aria-label="Unsaved changes"
                className="pointer-events-auto flex w-full max-w-xl animate-[admin-rise_0.2s_ease-out_both] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-night px-4 py-3 text-ivory shadow-lift ring-1 ring-gold/25"
              >
                <p className="min-w-0 flex-1 text-sm" aria-live="polite">
                  <span className="font-medium text-gold-light">
                    {dirtyKeys.length} unsaved {dirtyKeys.length === 1 ? "change" : "changes"}
                  </span>
                  {Object.keys(parsed?.errors ?? {}).length && submitted ? (
                    <span className="text-mist"> · fix the highlighted fields</span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    onClick={discard}
                    disabled={save.pending}
                    className="text-mist hover:bg-white/10 hover:text-ivory"
                  >
                    Discard
                  </AdminButton>
                  <AdminButton size="sm" variant="gold" type="submit" loading={save.pending}>
                    Save changes
                  </AdminButton>
                </div>
              </div>
            </div>
          ) : null}
        </form>
      )}
    </>
  );
}
