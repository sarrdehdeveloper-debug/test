"use client";

import { useState } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { Badge } from "@/components/admin/StatusBadge";
import { refreshPublicSite } from "@/components/admin/content/publicRefresh";
import { DiscountDialog } from "@/components/admin/offers/DiscountDialog";
import {
  DISCOUNT_STATE_STYLE,
  discountState,
  discountUsage,
  discountValueLabel,
} from "@/components/admin/offers/discountForm";
import { adminApi } from "@/lib/admin/api";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { useAdminMutation, useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import { toast } from "@/lib/admin/toast";
import type { AdminPage, Discount, DiscountDeleteOut } from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";

const PAGE_SIZE = 20;

function UsageCell({ discount }: { discount: Discount }) {
  const usage = discountUsage(discount);
  return (
    <span className="flex min-w-24 flex-col gap-1">
      <span className="text-[0.8125rem] text-ink tabular-nums">{usage.label}</span>
      {usage.fraction !== null ? (
        <span
          aria-hidden="true"
          className="block h-1 w-24 overflow-hidden rounded-full bg-stone-100"
        >
          <span
            className={
              usage.fraction >= 1 ? "block h-full bg-warning" : "block h-full bg-gold-bright"
            }
            style={{ width: `${Math.max(4, usage.fraction * 100)}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

function DiscountStateBadge({ discount, className }: { discount: Discount; className?: string }) {
  const state = DISCOUNT_STATE_STYLE[discountState(discount)];
  return (
    <Badge tone={state.tone} dot className={className}>
      {state.label}
    </Badge>
  );
}

function windowLabel(discount: Discount): string {
  if (!discount.starts_at && !discount.ends_at) return "Always";
  if (discount.starts_at && discount.ends_at) {
    return `${formatDate(discount.starts_at)} – ${formatDate(discount.ends_at)}`;
  }
  return discount.starts_at
    ? `From ${formatDate(discount.starts_at)}`
    : `Until ${formatDate(discount.ends_at)}`;
}

/** /admin/discounts — discount codes for the paid report (managers). */
export function DiscountsView() {
  const [params, setParams] = useUrlParams();
  const page = parsePage(params.get("page"));
  const query = useAdminQuery<AdminPage<Discount>>("/discounts", {
    query: { page, page_size: PAGE_SIZE },
  });
  const config = useAdminQuery<{ currency?: string }>("/api/v1/public-config");
  const currency = config.data?.currency ?? "USD";

  const [editing, setEditing] = useState<Discount | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Discount | null>(null);

  const remove = useAdminMutation(
    (discount: Discount) => adminApi.delete<DiscountDeleteOut>(`/discounts/${discount.id}`),
    {
      errorMessage: false, // shown inside the confirmation dialog
      onSuccess: async (result, discount) => {
        if (result.deactivated) {
          toast.warning(`${discount.code} was deactivated instead`, {
            description: "Orders have used it, so it is kept for their history.",
          });
        } else {
          toast.success(`Discount ${discount.code} deleted`);
        }
        refreshPublicSite(CACHE_TAGS.offers);
        await query.refetch();
      },
    },
  );

  const columns: DataTableColumn<Discount>[] = [
    {
      id: "code",
      header: "Code",
      cell: (discount) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-[0.8125rem] font-semibold tracking-wide" dir="ltr">
            {discount.code}
          </span>
          {discount.description ? (
            <span className="truncate text-xs text-ink-soft" title={discount.description}>
              {discount.description}
            </span>
          ) : null}
        </span>
      ),
      className: "max-w-[11rem] sm:max-w-[20rem]",
      skeletonClassName: "w-32",
    },
    {
      id: "value",
      header: "Discount",
      cell: (discount) => (
        <span className="flex flex-col items-start gap-1">
          <span className="font-medium whitespace-nowrap tabular-nums">
            {discountValueLabel(discount)}
          </span>
          <DiscountStateBadge discount={discount} className="sm:hidden" />
        </span>
      ),
      skeletonClassName: "w-12",
    },
    {
      id: "usage",
      header: "Used",
      hideBelow: "sm",
      cell: (discount) => <UsageCell discount={discount} />,
      skeletonClassName: "w-16",
    },
    {
      id: "window",
      header: "Valid",
      hideBelow: "lg",
      cell: (discount) => (
        <span
          className="whitespace-nowrap text-ink-soft"
          title={
            discount.starts_at || discount.ends_at
              ? `${formatDateTime(discount.starts_at)} → ${formatDateTime(discount.ends_at)}`
              : undefined
          }
        >
          {windowLabel(discount)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "sm",
      cell: (discount) => <DiscountStateBadge discount={discount} />,
      skeletonClassName: "w-16",
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      align: "end",
      cell: (discount) => (
        <span className="inline-flex gap-1">
          <AdminButton
            size="sm"
            variant="ghost"
            onClick={() => setEditing(discount)}
            className="max-sm:hidden"
          >
            Edit<span className="sr-only"> {discount.code}</span>
          </AdminButton>
          <AdminButton
            size="sm"
            variant="dangerGhost"
            icon="trash"
            iconOnly
            onClick={() => {
              remove.reset();
              setToDelete(discount);
            }}
          >
            {`Delete ${discount.code}`}
          </AdminButton>
        </span>
      ),
      skeletonClassName: "w-16",
    },
  ];

  const used = toDelete ? toDelete.redemptions_count > 0 : false;

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Codes customers enter on the order form. A code that orders have used cannot be deleted: it is deactivated instead, so their history stays intact."
        actions={
          <AdminButton variant="primary" icon="plus" onClick={() => setEditing(null)}>
            New discount
          </AdminButton>
        }
      />
      <Panel
        padding="none"
        footer={
          query.data && query.data.total > 0 ? (
            <Pagination
              page={page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(p) => setParams({ page: p > 1 ? p : null })}
              disabled={query.fetching}
              itemLabel="codes"
            />
          ) : undefined
        }
      >
        <DataTable
          caption="Discount codes"
          rows={query.data?.items}
          loading={query.loading}
          stale={query.isPlaceholder}
          error={query.error}
          onRetry={query.refetch}
          getRowId={(discount) => discount.id}
          onRowClick={(discount) => setEditing(discount)}
          columns={columns}
          emptyTitle="No discount codes yet"
          emptyDescription="Create a code, then link it to an offer to advertise it."
          emptyAction={
            <AdminButton size="sm" icon="plus" onClick={() => setEditing(null)}>
              New discount
            </AdminButton>
          }
        />
      </Panel>

      <DiscountDialog
        open={editing !== undefined}
        discount={editing ?? null}
        defaultCurrency={currency}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          void query.refetch();
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => (toDelete ? remove.mutateAsync(toDelete) : undefined)}
        tone="danger"
        title={used ? "Deactivate this code?" : "Delete this code?"}
        description={
          used
            ? `It has been used ${toDelete?.redemptions_count} ${toDelete?.redemptions_count === 1 ? "time" : "times"}, so it will be deactivated instead of deleted.`
            : "Customers can no longer use it. Offers linked to it stop showing a code."
        }
        confirmLabel={used ? "Deactivate" : "Delete code"}
      >
        {toDelete ? (
          <p className="font-mono text-sm font-semibold tracking-wide" dir="ltr">
            {toDelete.code}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
