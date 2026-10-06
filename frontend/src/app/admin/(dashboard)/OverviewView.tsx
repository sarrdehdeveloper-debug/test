"use client";

import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { Icon, type IconName } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { StatCard } from "@/components/admin/StatCard";
import { Badge, StatusBadge } from "@/components/admin/StatusBadge";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRelative,
  formatTime,
  shortId,
} from "@/lib/admin/format";
import { useAdminQuery } from "@/lib/admin/hooks";
import {
  ORDER_STATUSES,
  type AdminOrderItem,
  type AdminPage,
  type DashboardOut,
  type MediaItem,
  type PostAdminSummary,
  type WindowCounts,
} from "@/lib/admin/types";
import { cn } from "@/lib/cn";

/* ================================================================== managers */

const RECENT_COLUMNS: DataTableColumn<AdminOrderItem>[] = [
  {
    id: "order",
    header: "Order",
    cell: (order) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{order.email}</span>
        <span className="font-mono text-xs font-normal text-ink-soft">#{shortId(order.id)}</span>
      </span>
    ),
    className: "max-w-[11rem] sm:max-w-[16rem]",
    skeletonClassName: "w-40",
  },
  {
    id: "status",
    header: "Status",
    hideBelow: "sm",
    cell: (order) => <StatusBadge status={order.status} />,
  },
  {
    id: "amount",
    header: "Amount",
    align: "end",
    cell: (order) => (
      <span className="flex flex-col items-end gap-1">
        <span className="tabular-nums">{formatMoney(order.amount_cents, order.currency)}</span>
        <StatusBadge status={order.status} className="sm:hidden" />
      </span>
    ),
    className: "whitespace-nowrap",
    skeletonClassName: "w-14",
  },
  {
    id: "created",
    header: "Created",
    align: "end",
    hideBelow: "sm",
    cell: (order) => (
      <time
        dateTime={order.created_at}
        title={formatDateTime(order.created_at)}
        className="whitespace-nowrap text-ink-soft"
      >
        {formatRelative(order.created_at)}
      </time>
    ),
    skeletonClassName: "w-16",
  },
];

function windowHint(counts: WindowCounts, format: (n: number) => string = formatNumber) {
  return (
    <>
      <span className="block sm:inline">
        Today <span className="font-medium text-ink">{format(counts.today)}</span>
      </span>
      <span className="max-sm:hidden"> · </span>
      <span className="block sm:inline">
        7 days <span className="font-medium text-ink">{format(counts.last_7_days)}</span>
      </span>
    </>
  );
}

function StatusBreakdown({ counts }: { counts: DashboardOut["status_counts"] }) {
  const rows = ORDER_STATUSES.map((status) => ({ status, count: counts[status] ?? 0 }));
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <>
      <ul className="space-y-1">
        {rows.map(({ status, count }) => (
          <li key={status}>
            <Link
              href={`/admin/orders?status=${status}`}
              className="group grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1.5 py-1.5 hover:bg-stone-50"
            >
              <StatusBadge status={status} className="justify-self-start" />
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    count ? "bg-night/80 group-hover:bg-night" : "",
                  )}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="w-8 text-end text-sm font-medium text-ink tabular-nums">
                {formatNumber(count)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-ink-soft">
        {formatNumber(total)} {total === 1 ? "order" : "orders"} in total · select a status to
        filter the order list
      </p>
    </>
  );
}

function ManagerOverview({ firstName }: { firstName: string }) {
  const query = useAdminQuery<DashboardOut>("/dashboard", { refreshInterval: 60_000 });
  const { data, loading, error, fetching, refetch, updatedAt } = query;

  const header = (
    <PageHeader
      title="Overview"
      description={`Welcome back, ${firstName}. Sales, deliveries and system health at a glance.`}
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
  );

  if (error && !data) {
    return (
      <>
        {header}
        <Panel>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Panel>
      </>
    );
  }

  const currency = data?.currency ?? "USD";
  const money = (cents: number) => formatMoney(cents, currency);
  const failed = data?.failed_jobs ?? 0;

  return (
    <>
      {header}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Revenue · 30 days"
          icon="discounts"
          tone="gold"
          loading={loading}
          value={data ? money(data.revenue_cents.last_30_days) : ""}
          hint={data ? windowHint(data.revenue_cents, money) : null}
        />
        <StatCard
          label="Paid orders · 30 days"
          icon="orders"
          loading={loading}
          value={data ? formatNumber(data.orders.last_30_days) : ""}
          hint={data ? windowHint(data.orders) : null}
          href="/admin/orders"
        />
        <StatCard
          label="Free readings · 30 days"
          icon="readings"
          loading={loading}
          value={data ? formatNumber(data.free_readings.last_30_days) : ""}
          hint={data ? windowHint(data.free_readings) : null}
        />
        <StatCard
          label="Failed jobs"
          icon="jobs"
          tone={failed > 0 ? "alert" : "default"}
          loading={loading}
          value={data ? formatNumber(failed) : ""}
          hint={
            data
              ? failed > 0
                ? "Need attention: retry or investigate"
                : "All background jobs are healthy"
              : null
          }
          href="/admin/jobs"
        />
      </section>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="Recent orders"
          description="The latest orders, newest first."
          padding="none"
          actions={
            <AdminButtonLink href="/admin/orders" size="sm" variant="ghost" iconEnd="arrowRight">
              All orders
            </AdminButtonLink>
          }
        >
          <DataTable
            caption="Recent orders"
            columns={RECENT_COLUMNS}
            rows={data?.recent_orders}
            loading={loading}
            getRowId={(order) => order.id}
            rowHref={(order) => `/admin/orders/${order.id}`}
            emptyTitle="No orders yet"
            emptyDescription="Paid report orders will appear here as soon as customers check out."
            skeletonRows={6}
          />
        </Panel>

        <Panel title="Orders by status" description="All orders, by their current status.">
          {data ? (
            <StatusBreakdown counts={data.status_counts} />
          ) : (
            <div className="space-y-3" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ================================================================== editors */

interface Shortcut {
  href: string;
  title: string;
  description: string;
  icon: IconName;
}

const CONTENT_SHORTCUTS: Shortcut[] = [
  {
    href: "/admin/content",
    title: "Site content",
    description: "Headlines, page texts and legal pages in English and Arabic.",
    icon: "content",
  },
  {
    href: "/admin/free-readings",
    title: "Free readings",
    description: "The 12 sign and 12 animal readings shown by the free plan.",
    icon: "readings",
  },
  {
    href: "/admin/offers",
    title: "Offers",
    description: "Promotions and the banner on the home page.",
    icon: "offers",
  },
  {
    href: "/admin/library",
    title: "Galaxy Library",
    description: "Book series and their books.",
    icon: "library",
  },
  {
    href: "/admin/blog",
    title: "Blog",
    description: "Write, schedule and publish articles.",
    icon: "blog",
  },
  {
    href: "/admin/media",
    title: "Media",
    description: "Upload and manage images used across the site.",
    icon: "media",
  },
];

function EditorOverview({ firstName }: { firstName: string }) {
  const drafts = useAdminQuery<AdminPage<PostAdminSummary>>("/blog-posts", {
    query: { status: "draft", page_size: 1 },
  });
  const media = useAdminQuery<AdminPage<MediaItem>>("/media", { query: { page_size: 1 } });
  const badges: Record<string, string | null> = {
    "/admin/blog": drafts.data?.total
      ? `${formatNumber(drafts.data.total)} ${drafts.data.total === 1 ? "draft" : "drafts"}`
      : null,
    "/admin/media": media.data?.total
      ? `${formatNumber(media.data.total)} ${media.data.total === 1 ? "image" : "images"}`
      : null,
  };

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="You can edit everything visitors read on Zodiac Blend, in English and Arabic. Pick a section to start."
      />
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {CONTENT_SHORTCUTS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex h-full items-start gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgb(31_36_48/0.04)] transition-[border-color,box-shadow] hover:border-gold/50 hover:shadow-card"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-night text-gold-light">
                <Icon name={item.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{item.title}</span>
                  {badges[item.href] ? <Badge tone="gold">{badges[item.href]}</Badge> : null}
                </span>
                <span className="mt-1 block text-sm text-ink-soft">{item.description}</span>
              </span>
              <Icon
                name="arrowRight"
                className="mt-1 size-4 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-deep rtl:-scale-x-100"
              />
            </Link>
          </li>
        ))}
      </ul>
      <Panel className="mt-6" title="Good to know">
        <ul className="space-y-2.5 text-sm text-ink-soft">
          <li className="flex gap-2.5">
            <Icon name="sparkle" className="mt-0.5 size-4 text-gold" />
            Saved changes appear on the public site within a couple of minutes at most.
          </li>
          <li className="flex gap-2.5">
            <Icon name="sparkle" className="mt-0.5 size-4 text-gold" />
            Leave an Arabic field empty to show the English text instead; tabs mark missing
            translations.
          </li>
          <li className="flex gap-2.5">
            <Icon name="sparkle" className="mt-0.5 size-4 text-gold" />
            Rich text uses Markdown. The preview next to the editor shows exactly what visitors will
            see.
          </li>
        </ul>
      </Panel>
    </>
  );
}

/* ================================================================== page */

export function OverviewView() {
  const { user, can } = useAdminAuth();
  const firstName = (user?.name || user?.email || "").trim().split(/\s+/)[0] || "there";
  return can("manager") ? (
    <ManagerOverview firstName={firstName} />
  ) : (
    <EditorOverview firstName={firstName} />
  );
}
