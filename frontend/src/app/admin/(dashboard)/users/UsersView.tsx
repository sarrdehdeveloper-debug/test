"use client";

import { useState } from "react";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { Badge, StatusBadge, type BadgeTone } from "@/components/admin/StatusBadge";
import { CreateUserDialog, EditUserDialog } from "@/components/admin/users/UserFormDialog";
import { isLastActiveOwner, userActionErrorMessage } from "@/components/admin/users/userForm";
import { adminApi } from "@/lib/admin/api";
import { formatDateTime, formatRelative, initials } from "@/lib/admin/format";
import { useAdminMutation, useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/admin/roles";
import {
  ADMIN_ROLES,
  type AdminPage,
  type AdminRole,
  type ManagedUser,
  type UserCreateIn,
  type UserUpdateIn,
} from "@/lib/admin/types";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 50;
const ROLE_TONES: Record<AdminRole, BadgeTone> = {
  owner: "navy",
  admin: "gold",
  editor: "neutral",
};

type Confirm = { kind: "deactivate" | "reactivate" | "reset_mfa"; user: ManagedUser } | null;

/** `/admin/users` (owners): admin accounts, roles, status and two-factor. */
export function UsersView() {
  const { user: me, refresh: refreshMe } = useAdminAuth();
  const [params, setParams] = useUrlParams();
  const page = parsePage(params.get("page"));
  const users = useAdminQuery<AdminPage<ManagedUser>>("/users", {
    query: { page, page_size: PAGE_SIZE },
  });
  const all = users.data?.items ?? [];
  // Active accounts first (the API lists by id); deactivated ones stay visible below.
  const rows = users.data
    ? [...all].sort((a, b) => Number(b.is_active) - Number(a.is_active))
    : undefined;

  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<{ user: ManagedUser; open: boolean; n: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const replaceUser = (updated: ManagedUser) =>
    users.setData((prev) =>
      prev ? { ...prev, items: prev.items.map((u) => (u.id === updated.id ? updated : u)) } : prev,
    );

  const create = useAdminMutation(
    (body: UserCreateIn) => adminApi.post<ManagedUser>("/users", body),
    {
      errorMessage: false, // shown in the dialog
      successMessage: (created) =>
        `${created.name} can now sign in as ${ROLE_LABELS[created.role].toLowerCase()}`,
      onSuccess: () => users.refetch(),
    },
  );
  const update = useAdminMutation(
    ({ user, body }: { user: ManagedUser; body: UserUpdateIn }) =>
      adminApi.patch<ManagedUser>(`/users/${user.id}`, body),
    {
      errorMessage: false,
      successMessage: (updated, { body }) =>
        body.reset_mfa
          ? `Two-factor reset for ${updated.name}`
          : body.is_active === true && Object.keys(body).length === 1
            ? `${updated.name} is active again`
            : `${updated.name} saved`,
      onSuccess: (updated) => {
        replaceUser(updated);
        if (updated.id === me?.id) void refreshMe();
      },
    },
  );
  const deactivate = useAdminMutation(
    (user: ManagedUser) => adminApi.delete<ManagedUser>(`/users/${user.id}`),
    {
      errorMessage: false,
      successMessage: (updated) => `${updated.name} is deactivated and signed out`,
      onSuccess: (updated) => replaceUser(updated),
    },
  );

  const openEdit = (user: ManagedUser) =>
    setEdit((prev) => ({ user, open: true, n: (prev?.n ?? 0) + 1 }));

  const columns: DataTableColumn<ManagedUser>[] = [
    {
      id: "user",
      header: "User",
      cell: (user) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold tracking-wide",
              user.is_active ? "bg-gold-soft-gradient text-night" : "bg-stone-200 text-stone-500",
            )}
          >
            {initials(user.name || user.email)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className={cn("truncate font-medium", !user.is_active && "text-ink-soft")}>
                {user.name}
              </span>
              {user.id === me?.id ? <Badge tone="info">You</Badge> : null}
            </span>
            <span className="truncate text-xs text-ink-soft" dir="ltr">
              {user.email}
            </span>
            <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
              <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
              {!user.is_active ? <StatusBadge kind="active" status={false} /> : null}
            </span>
          </span>
        </span>
      ),
      className: "max-w-[13rem] sm:max-w-[20rem]",
      skeletonClassName: "w-48",
    },
    {
      id: "role",
      header: "Role",
      hideBelow: "sm",
      cell: (user) => (
        <span className="flex flex-col items-start gap-1">
          <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
          {!user.is_active ? (
            <StatusBadge kind="active" status={false} className="md:hidden" />
          ) : null}
        </span>
      ),
      skeletonClassName: "w-16",
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "md",
      cell: (user) => <StatusBadge kind="active" status={user.is_active} />,
      skeletonClassName: "w-16",
    },
    {
      id: "mfa",
      header: "Two-factor",
      hideBelow: "lg",
      cell: (user) => (
        <Badge tone={user.mfa_enabled ? "success" : "neutral"} dot>
          {user.mfa_enabled ? "On" : "Off"}
        </Badge>
      ),
      skeletonClassName: "w-12",
    },
    {
      id: "login",
      header: "Last sign-in",
      hideBelow: "lg",
      cell: (user) =>
        user.last_login_at ? (
          <time
            dateTime={user.last_login_at}
            title={formatDateTime(user.last_login_at)}
            className="whitespace-nowrap text-ink-soft"
          >
            {formatRelative(user.last_login_at)}
          </time>
        ) : (
          <span className="text-stone-400">Never</span>
        ),
      skeletonClassName: "w-20",
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      align: "end",
      cell: (user) => {
        const self = user.id === me?.id;
        return (
          <span className="flex items-center justify-end gap-1">
            <AdminButton size="xs" icon="blog" onClick={() => openEdit(user)}>
              <span className="max-sm:sr-only">Edit</span>
              <span className="sr-only"> {user.name}</span>
            </AdminButton>
            {user.mfa_enabled && !self ? (
              <AdminButton
                size="xs"
                variant="ghost"
                icon="shield"
                iconOnly
                onClick={() => setConfirm({ kind: "reset_mfa", user })}
              >
                {`Reset two-factor for ${user.name}`}
              </AdminButton>
            ) : null}
            {self ? null : user.is_active ? (
              <AdminButton
                size="xs"
                variant="dangerGhost"
                icon="lock"
                iconOnly
                disabled={isLastActiveOwner(user, all)}
                title={
                  isLastActiveOwner(user, all)
                    ? "The only active owner cannot be deactivated"
                    : `Deactivate ${user.name}`
                }
                onClick={() => setConfirm({ kind: "deactivate", user })}
              >
                {`Deactivate ${user.name}`}
              </AdminButton>
            ) : (
              <AdminButton
                size="xs"
                variant="ghost"
                icon="refresh"
                iconOnly
                onClick={() => setConfirm({ kind: "reactivate", user })}
              >
                {`Reactivate ${user.name}`}
              </AdminButton>
            )}
          </span>
        );
      },
      skeletonClassName: "w-20",
    },
  ];

  const target = confirm?.user;

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to this dashboard and what they may do. Only owners see this page."
        actions={
          <AdminButton variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
            Add user
          </AdminButton>
        }
      />

      <Panel
        padding="none"
        footer={
          users.data && users.data.total > PAGE_SIZE ? (
            <Pagination
              page={page}
              pageSize={users.data.page_size}
              total={users.data.total}
              itemLabel="users"
              onPageChange={(next) => setParams({ page: next > 1 ? next : null })}
            />
          ) : null
        }
      >
        <DataTable
          caption="Admin users"
          columns={columns}
          rows={rows}
          loading={users.loading}
          stale={users.isPlaceholder}
          error={users.error}
          onRetry={() => void users.refetch()}
          getRowId={(user) => user.id}
          onRowClick={openEdit}
          emptyTitle="No admin users"
        />
      </Panel>

      <section aria-labelledby="roles-title" className="mt-6">
        <h2 id="roles-title" className="mb-3 text-sm font-semibold text-ink">
          Roles
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {ADMIN_ROLES.map((role) => (
            <li key={role} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
              <Badge tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Badge>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          Need to change your own password or two-factor?{" "}
          <AdminButtonLink
            href="/admin/account"
            size="xs"
            variant="ghost"
            className="-ms-1 align-baseline"
          >
            Go to your account
          </AdminButtonLink>
        </p>
      </section>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(body) => create.mutateAsync(body)}
      />

      {edit ? (
        <EditUserDialog
          key={`${edit.user.id}-${edit.n}`}
          open={edit.open}
          user={edit.user}
          isSelf={edit.user.id === me?.id}
          lastOwner={isLastActiveOwner(edit.user, all)}
          onClose={() => setEdit((prev) => (prev ? { ...prev, open: false } : prev))}
          onSubmit={(user, body) => update.mutateAsync({ user, body })}
        />
      ) : null}

      <ConfirmDialog
        open={confirm?.kind === "deactivate"}
        onClose={() => setConfirm(null)}
        tone="danger"
        title={target ? `Deactivate ${target.name}?` : "Deactivate?"}
        description="They are signed out everywhere at once and can no longer sign in. Their past actions stay in the audit log."
        confirmLabel="Deactivate"
        formatError={userActionErrorMessage}
        onConfirm={() => (target ? deactivate.mutateAsync(target) : undefined)}
      >
        {target ? (
          <p className="text-ink-soft">
            You can reactivate <span dir="ltr">{target.email}</span> later.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "reactivate"}
        onClose={() => setConfirm(null)}
        title={target ? `Reactivate ${target.name}?` : "Reactivate?"}
        description={
          target
            ? `They can sign in again as ${ROLE_LABELS[target.role].toLowerCase()} with their existing password.`
            : undefined
        }
        confirmLabel="Reactivate"
        formatError={userActionErrorMessage}
        onConfirm={() =>
          target ? update.mutateAsync({ user: target, body: { is_active: true } }) : undefined
        }
      />

      <ConfirmDialog
        open={confirm?.kind === "reset_mfa"}
        onClose={() => setConfirm(null)}
        title={target ? `Reset two-factor for ${target.name}?` : "Reset two-factor?"}
        description="For a lost authenticator app. They sign in with their password only, are signed out everywhere now, and can set up two-factor again on their Account page."
        confirmLabel="Reset two-factor"
        formatError={userActionErrorMessage}
        onConfirm={() =>
          target ? update.mutateAsync({ user: target, body: { reset_mfa: true } }) : undefined
        }
      />
    </>
  );
}
