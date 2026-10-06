"use client";

import { AdminButton } from "@/components/admin/AdminButton";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { Badge, StatusBadge, statusStyle } from "@/components/admin/StatusBadge";
import { FilterBar, FilterSelect, SearchInput } from "@/components/admin/Toolbar";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  formatTime,
  shortId,
} from "@/lib/admin/format";
import { useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import {
  ORDER_STATUSES,
  type AdminOrderItem,
  type AdminPage,
  type OrderStatus,
} from "@/lib/admin/types";

const PAGE_SIZE = 25;

const STATUS_OPTIONS = ORDER_STATUSES.map((status) => ({
  value: status,
  label: statusStyle("order", status).label,
}));

function isOrderStatus(value: string | null): value is OrderStatus {
  return !!value && (ORDER_STATUSES as readonly string[]).includes(value);
}

const COLUMNS: DataTableColumn<AdminOrderItem>[] = [
  {
    id: "order",
    header: "Order",
    cell: (order) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate" dir="ltr">
          {order.email}
        </span>
        <span className="font-mono text-xs font-normal text-ink-soft">
          #{shortId(order.id)}
          <span className="font-sans md:hidden"> · {formatDate(order.created_at)}</span>
        </span>
      </span>
    ),
    className: "max-w-[12rem] sm:max-w-[18rem]",
    skeletonClassName: "w-44",
  },
  {
    id: "created",
    header: "Created",
    hideBelow: "md",
    cell: (order) => (
      <span className="flex flex-col whitespace-nowrap">
        <time dateTime={order.created_at} title={formatDateTime(order.created_at)}>
          {formatDate(order.created_at)}
        </time>
        <span className="text-xs text-ink-soft">
          {formatTime(order.created_at)} · {formatRelative(order.created_at)}
        </span>
      </span>
    ),
    skeletonClassName: "w-24",
  },
  {
    id: "status",
    header: "Status",
    hideBelow: "sm",
    cell: (order) => <StatusBadge status={order.status} />,
    skeletonClassName: "w-20",
  },
  {
    id: "amount",
    header: "Amount",
    align: "end",
    cell: (order) => (
      <span className="flex flex-col items-end gap-1">
        <span className="font-medium tabular-nums" dir="ltr">
          {formatMoney(order.amount_cents, order.currency)}
        </span>
        <StatusBadge status={order.status} className="sm:hidden" />
      </span>
    ),
    className: "whitespace-nowrap",
    skeletonClassName: "w-14",
  },
  {
    id: "discount",
    header: "Discount",
    hideBelow: "lg",
    cell: (order) =>
      order.discount_code ? (
        <Badge tone="gold" className="font-mono">
          {order.discount_code}
        </Badge>
      ) : (
        <span className="text-stone-400">—</span>
      ),
    skeletonClassName: "w-16",
  },
  {
    id: "locale",
    header: "Locale",
    hideBelow: "lg",
    align: "center",
    cell: (order) => (
      <span
        className="inline-flex min-w-8 justify-center rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold tracking-wide text-ink-soft uppercase"
        title={order.locale === "ar" ? "Arabic" : order.locale === "en" ? "English" : order.locale}
      >
        {order.locale}
      </span>
    ),
    skeletonClassName: "w-8 mx-auto",
  },
];

/** `/admin/orders`: filterable, paginated order list (filters and page live in the URL). */
export function OrdersView() {
  const [params, setParams] = useUrlParams();
  const page = parsePage(params.get("page"));
  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = isOrderStatus(rawStatus) ? rawStatus : "";
  const filtered = Boolean(q || status);

  const orders = useAdminQuery<AdminPage<AdminOrderItem>>("/orders", {
    query: { page, page_size: PAGE_SIZE, status: status || undefined, q: q || undefined },
  });
  const { data, loading, fetching, error, refetch, updatedAt, isPlaceholder } = orders;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every paid-report order: payment, generation and delivery. Open an order to retry generation, resend the email or extend access."
        actions={
          <>
            {updatedAt ? (
              <span className="text-xs text-ink-soft" aria-live="polite">
                Updated {formatTime(updatedAt)}
              </span>
            ) : null}
            <AdminButton
              size="sm"
              icon="refresh"
              loading={fetching && !loading}
              onClick={() => void refetch()}
            >
              Refresh
            </AdminButton>
          </>
        }
      />

      <FilterBar active={filtered} onClear={() => setParams({ q: null, status: null, page: null })}>
        <SearchInput
          value={q}
          onChange={(value) => setParams({ q: value || null, page: null })}
          placeholder="Search email or order id"
          label="Search orders by email or order id"
          className="sm:w-80"
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => setParams({ status: value || null, page: null })}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
        />
      </FilterBar>

      <Panel
        padding="none"
        footer={
          data ? (
            <Pagination
              page={page}
              pageSize={data.page_size}
              total={data.total}
              itemLabel={data.total === 1 ? "order" : "orders"}
              disabled={fetching}
              onPageChange={(next) => setParams({ page: next > 1 ? next : null })}
            />
          ) : null
        }
      >
        <DataTable
          caption={filtered ? "Orders matching the filters" : "Orders"}
          columns={COLUMNS}
          rows={data?.items}
          loading={loading}
          stale={isPlaceholder}
          error={error}
          onRetry={() => void refetch()}
          getRowId={(order) => order.id}
          rowHref={(order) => `/admin/orders/${order.id}`}
          skeletonRows={8}
          emptyTitle={filtered ? "No orders match these filters" : "No orders yet"}
          emptyDescription={
            filtered
              ? "Check the spelling, search with part of the email or the first characters of the order id, or clear the filters."
              : "Orders appear here as soon as customers start a checkout."
          }
          emptyAction={
            filtered ? (
              <AdminButton
                size="sm"
                icon="close"
                onClick={() => setParams({ q: null, status: null, page: null })}
              >
                Clear filters
              </AdminButton>
            ) : null
          }
        />
      </Panel>
    </>
  );
}
