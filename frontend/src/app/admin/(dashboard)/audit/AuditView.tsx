"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminButton } from "@/components/admin/AdminButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { Icon } from "@/components/admin/icons";
import { JsonPreview } from "@/components/admin/JsonPreview";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { FilterBar, FilterSelect } from "@/components/admin/Toolbar";
import { formatDateTime, formatRelative, formatTime } from "@/lib/admin/format";
import { useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import type { AdminPage, AuditLogEntry, ManagedUser } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import {
  ALL_AUDIT_ACTIONS,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  auditActionLabel,
  auditEntityHref,
  entityLabel,
  entityTypeLabel,
  summarizeAuditData,
} from "./audit";

const PAGE_SIZE = 50;

function positiveInt(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function AuditRow({
  entry,
  onFilter,
}: {
  entry: AuditLogEntry;
  onFilter: (changes: Record<string, string | number | null>) => void;
}) {
  const [open, setOpen] = useState(false);
  const href = auditEntityHref(entry);
  const summary = summarizeAuditData(entry.data);
  const hasData = Object.keys(entry.data ?? {}).length > 0;

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-x-5 gap-y-1.5 sm:flex-row sm:items-start">
        <time
          dateTime={entry.created_at}
          title={formatDateTime(entry.created_at, { seconds: true })}
          className="shrink-0 text-xs text-ink-soft tabular-nums sm:w-36 sm:pt-0.5"
        >
          <span className="text-ink">{formatDateTime(entry.created_at)}</span>
          <span className="max-sm:before:content-['_·_'] sm:block">
            {formatRelative(entry.created_at)}
          </span>
        </time>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <button
              type="button"
              onClick={() => onFilter({ action: entry.action, page: null })}
              title={`Show only “${auditActionLabel(entry.action)}”`}
              className="rounded-md bg-stone-100 px-2 py-0.5 text-[0.8125rem] font-medium text-ink ring-1 ring-stone-200 transition-colors ring-inset hover:bg-gold-pale/60 hover:ring-gold/30"
            >
              {auditActionLabel(entry.action)}
            </button>
            <span className="text-ink-soft">by</span>
            {entry.user_id ? (
              <button
                type="button"
                onClick={() => onFilter({ user: entry.user_id, page: null })}
                title="Show only this admin's actions"
                className="max-w-full truncate font-medium text-ink underline decoration-stone-300 underline-offset-2 hover:decoration-gold"
                dir="ltr"
              >
                {entry.user_email ?? `user #${entry.user_id}`}
              </button>
            ) : (
              <span className="font-medium text-ink">System</span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
            <span>
              <button
                type="button"
                onClick={() =>
                  onFilter({ entity_type: entry.entity_type, action: null, page: null })
                }
                className="hover:text-ink hover:underline"
                title="Show only this type"
              >
                {entityLabel(entry.entity_type)}
              </button>
              {entry.entity_id ? (
                <>
                  {" "}
                  {href ? (
                    <Link
                      href={href}
                      className="font-mono text-ink underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
                    >
                      #{entry.entity_id.length > 12 ? entry.entity_id.slice(0, 8) : entry.entity_id}
                    </Link>
                  ) : (
                    <span className="font-mono text-ink">#{entry.entity_id}</span>
                  )}
                </>
              ) : href ? (
                <>
                  {" "}
                  <Link
                    href={href}
                    className="text-ink underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
                  >
                    open
                  </Link>
                </>
              ) : null}
            </span>
            {entry.ip ? <span className="font-mono">IP {entry.ip}</span> : null}
          </p>
          {summary.length ? (
            <ul className="mt-2 space-y-0.5 font-mono text-xs text-ink">
              {summary.map((line) => (
                <li key={line} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {open ? <JsonPreview value={entry.data} label="Data" className="mt-2.5" /> : null}
        </div>

        {hasData ? (
          <AdminButton
            size="xs"
            variant="ghost"
            iconEnd={open ? "chevronDown" : "chevronRight"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="self-start max-sm:-ms-2"
          >
            {open ? "Hide data" : "Data"}
          </AdminButton>
        ) : null}
      </div>
    </li>
  );
}

/** `/admin/audit` (managers): who changed what, filterable by type, action and admin. */
export function AuditView() {
  const { can, user: me } = useAdminAuth();
  const [params, setParams] = useUrlParams();
  const page = parsePage(params.get("page"));
  const entityType = params.get("entity_type") ?? "";
  const action = params.get("action") ?? "";
  const userId = positiveInt(params.get("user"));
  const filtered = Boolean(entityType || action || userId);

  const logs = useAdminQuery<AdminPage<AuditLogEntry>>("/audit-logs", {
    query: {
      page,
      page_size: PAGE_SIZE,
      entity_type: entityType || undefined,
      action: action || undefined,
      user_id: userId ?? undefined,
    },
  });
  // Owners can list every admin; others pick from themselves and the admins seen in the log.
  const users = useAdminQuery<AdminPage<ManagedUser>>("/users", {
    query: { page_size: 100 },
    enabled: can("owner"),
  });
  const [seen, setSeen] = useState<Record<number, string>>({});
  const items = logs.data?.items;
  const unseen = items?.filter((e) => e.user_id && e.user_email && !(e.user_id in seen)) ?? [];
  if (unseen.length) {
    setSeen((prev) => {
      const next = { ...prev };
      for (const e of unseen) next[e.user_id as number] = e.user_email as string;
      return next;
    });
  }

  const userLabels = new Map<number, string>();
  if (me) userLabels.set(me.id, `${me.email} (you)`);
  for (const u of users.data?.items ?? []) if (!userLabels.has(u.id)) userLabels.set(u.id, u.email);
  for (const [id, email] of Object.entries(seen)) {
    if (!userLabels.has(Number(id))) userLabels.set(Number(id), email);
  }
  if (userId && !userLabels.has(userId)) userLabels.set(userId, `User #${userId}`);
  const userOptions = [...userLabels.entries()].map(([id, label]) => ({
    value: String(id),
    label,
  }));

  const actionOptions = (entityType ? (AUDIT_ACTIONS[entityType] ?? []) : ALL_AUDIT_ACTIONS).map(
    (value) => ({ value, label: auditActionLabel(value) }),
  );
  if (action && !actionOptions.some((o) => o.value === action)) {
    actionOptions.push({ value: action, label: auditActionLabel(action) });
  }
  const typeOptions = [...AUDIT_ENTITY_TYPES];
  if (entityType && !typeOptions.some((o) => o.value === entityType)) {
    typeOptions.push({ value: entityType, label: entityTypeLabel(entityType) });
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made in the dashboard, newest first: who did what, when, and the details."
        actions={
          <>
            {logs.updatedAt ? (
              <span className="text-xs text-ink-soft" aria-live="polite">
                Updated {formatTime(logs.updatedAt)}
              </span>
            ) : null}
            <AdminButton
              size="sm"
              icon="refresh"
              loading={logs.fetching && !logs.loading}
              onClick={() => void logs.refetch()}
            >
              Refresh
            </AdminButton>
          </>
        }
      />

      <FilterBar
        active={filtered}
        onClear={() => setParams({ entity_type: null, action: null, user: null, page: null })}
      >
        <FilterSelect
          label="Type"
          showLabel
          value={entityType}
          onChange={(value) => {
            const keep = value && action && AUDIT_ACTIONS[value]?.includes(action);
            setParams({ entity_type: value || null, action: keep ? action : null, page: null });
          }}
          options={typeOptions}
          allLabel="All types"
        />
        <FilterSelect
          label="Action"
          showLabel
          value={action}
          onChange={(value) => setParams({ action: value || null, page: null })}
          options={actionOptions}
          allLabel="All actions"
          className="sm:w-60"
        />
        <FilterSelect
          label="Admin"
          showLabel
          value={userId ? String(userId) : ""}
          onChange={(value) => setParams({ user: value || null, page: null })}
          options={userOptions}
          allLabel="Everyone"
          className="sm:w-64"
        />
      </FilterBar>

      <Panel
        padding="none"
        footer={
          logs.data && logs.data.total > 0 ? (
            <Pagination
              page={page}
              pageSize={logs.data.page_size}
              total={logs.data.total}
              itemLabel={logs.data.total === 1 ? "entry" : "entries"}
              disabled={logs.fetching}
              onPageChange={(next) => setParams({ page: next > 1 ? next : null })}
            />
          ) : null
        }
      >
        {logs.loading ? (
          <ul aria-busy="true" className="divide-y divide-stone-100">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex gap-5 px-4 py-4 sm:px-5">
                <Skeleton className="h-3.5 w-28 max-sm:hidden" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </li>
            ))}
          </ul>
        ) : logs.error && !items?.length ? (
          <ErrorState error={logs.error} onRetry={() => void logs.refetch()} compact />
        ) : !items?.length ? (
          <EmptyState
            compact
            icon="audit"
            title={filtered ? "No entries match these filters" : "Nothing recorded yet"}
            description={
              filtered
                ? "Try another type or action, or clear the filters."
                : "Changes made in the dashboard are listed here."
            }
            action={
              filtered ? (
                <AdminButton
                  size="sm"
                  icon="close"
                  onClick={() =>
                    setParams({ entity_type: null, action: null, user: null, page: null })
                  }
                >
                  Clear filters
                </AdminButton>
              ) : null
            }
          />
        ) : (
          <ul
            aria-busy={logs.isPlaceholder || undefined}
            className={cn(
              "divide-y divide-stone-100 transition-opacity",
              logs.isPlaceholder && "opacity-55",
            )}
          >
            {items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} onFilter={setParams} />
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
        <Icon name="info" className="size-3.5" />
        Click an action, an admin or a type in the list to filter by it.
      </p>
    </>
  );
}
