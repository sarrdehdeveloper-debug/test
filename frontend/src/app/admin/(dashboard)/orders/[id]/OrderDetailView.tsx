"use client";

import { useState } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { Icon } from "@/components/admin/icons";
import { KeyValueList } from "@/components/admin/KeyValueList";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { Badge, StatusBadge } from "@/components/admin/StatusBadge";
import { ChartSummary } from "@/components/admin/orders/ChartSummary";
import { DetailList } from "@/components/admin/orders/DetailList";
import { ErrorText } from "@/components/admin/orders/ErrorText";
import { JobList } from "@/components/admin/orders/JobList";
import { OrderActions } from "@/components/admin/orders/OrderActions";
import {
  GENERATING_STATUSES,
  reportAccess,
  shouldPollOrder,
} from "@/components/admin/orders/orderHelpers";
import { PaymentEvents } from "@/components/admin/orders/PaymentEvents";
import { SectionList } from "@/components/admin/orders/SectionList";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRelative,
  formatTime,
  humanize,
  shortId,
} from "@/lib/admin/format";
import { useAdminQuery } from "@/lib/admin/hooks";
import type { AdminOrderDetail } from "@/lib/admin/types";

const POLL_MS = 3_000;
const LOCALE_NAMES: Record<string, string> = { en: "English", ar: "Arabic" };

function Mono({ value, label }: { value: string | null; label: string }) {
  if (!value) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono text-[0.8125rem]" dir="ltr" title={value}>
        {value}
      </span>
      <CopyButton value={value} label={`Copy ${label}`} />
    </span>
  );
}

function When({ value, stacked = false }: { value: string | null; stacked?: boolean }) {
  if (!value) return null;
  return (
    <span className={stacked ? "flex flex-col" : undefined}>
      <time dateTime={value}>{formatDateTime(value)}</time>
      {stacked ? null : " "}
      <span className="text-xs text-ink-soft">
        {stacked ? "" : "· "}
        {formatRelative(value)}
      </span>
    </span>
  );
}

function GenerationBanner({ order }: { order: AdminOrderDetail }) {
  const { sections_done: done, sections_total: total } = order.progress;
  if (GENERATING_STATUSES.includes(order.status)) {
    const percent = total ? Math.round((done / total) * 100) : 0;
    return (
      <section
        aria-label="Generation progress"
        className="mb-6 rounded-xl border border-info/20 bg-info-soft/50 px-4 py-3.5 sm:px-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium text-ink" aria-live="polite">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-info" />
            </span>
            {order.status === "generating"
              ? `Writing the report: ${done} of ${total} sections done`
              : order.status === "queued"
                ? "Queued: the worker will start writing the report shortly"
                : "Paid: waiting for the generation job"}
          </p>
          <span className="text-xs text-ink-soft">Updates automatically</span>
        </div>
        <div
          role="progressbar"
          aria-label="Sections written"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white"
        >
          <div
            className="h-full rounded-full bg-gold-gradient transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </section>
    );
  }
  if (order.status === "generation_failed") {
    return (
      <section aria-label="Generation failed" className="mb-6 space-y-2">
        <ErrorText
          label={`Generation failed after ${done} of ${total} sections`}
          text={order.last_error || "No error message was recorded."}
          defaultOpen={false}
        />
      </section>
    );
  }
  return null;
}

function DetailSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading order…</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/** `/admin/orders/[id]`: everything about one order, with the support actions. */
export function OrderDetailView({ id }: { id: string }) {
  // Poll while generation runs or a job is queued (e.g. a resent email), then stop.
  const [poll, setPoll] = useState(false);
  const query = useAdminQuery<AdminOrderDetail>(`/orders/${encodeURIComponent(id)}`, {
    refreshInterval: poll ? POLL_MS : 0,
  });
  const nextPoll = shouldPollOrder(query.data);
  if (nextPoll !== poll) setPoll(nextPoll);
  const order = query.data;
  const updatedAt = query.updatedAt;
  const refetch = query.refetch;

  const breadcrumbs = [{ label: "Orders", href: "/admin/orders" }, { label: `#${shortId(id)}` }];

  if (!order) {
    if (query.error) {
      return (
        <>
          <PageHeader title="Order" breadcrumbs={breadcrumbs} />
          <Panel>
            {query.error.isNotFound ? (
              <EmptyState
                icon="orders"
                title="Order not found"
                description="No order has this id. It may be mistyped, or the link is outdated."
                action={
                  <AdminButtonLink href="/admin/orders" size="sm" icon="chevronLeft">
                    Back to orders
                  </AdminButtonLink>
                }
              />
            ) : (
              <ErrorState error={query.error} onRetry={() => void refetch()} />
            )}
          </Panel>
        </>
      );
    }
    return <DetailSkeleton />;
  }

  const access = reportAccess(order.report);
  const discount = order.discount_cents > 0 || order.discount_code;

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={
          <span className="flex items-center gap-1">
            Order <span className="font-mono text-[0.85em] font-medium">#{shortId(order.id)}</span>
            <CopyButton value={order.id} label="Copy full order id" className="ms-1" />
          </span>
        }
        badge={<StatusBadge status={order.status} />}
        description={
          <>
            <span dir="ltr">{order.email}</span> ·{" "}
            <span className="font-medium text-ink">
              {formatMoney(order.amount_cents, order.currency)}
            </span>{" "}
            · created {formatDateTime(order.created_at)}
          </>
        }
        actions={
          <>
            {updatedAt ? (
              <span className="text-xs text-ink-soft" aria-live="polite">
                Updated {formatTime(updatedAt, { seconds: poll })}
              </span>
            ) : null}
            <AdminButton
              size="sm"
              icon="refresh"
              loading={query.fetching && !query.loading}
              onClick={() => void refetch()}
            >
              Refresh
            </AdminButton>
          </>
        }
      />

      <GenerationBanner order={order} />

      {order.personal_data_purged_at ? (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-ink-soft">
          <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-gold-deep" />
          Birth data was deleted on {formatDate(order.personal_data_purged_at)} under the retention
          policy. Payment and delivery records are kept.
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[auto_1fr]">
        {/* Side column, top: actions + report (first on phones). */}
        <div className="min-w-0 space-y-6 xl:col-start-2 xl:row-start-1">
          <OrderActions order={order} onChanged={refetch} />

          <Panel
            title="Report"
            actions={
              access.state === "active" ? (
                <Badge tone="success" dot>
                  Available
                </Badge>
              ) : access.state === "expired" ? (
                <Badge tone="warning" dot>
                  Expired
                </Badge>
              ) : access.state === "deleted" ? (
                <Badge tone="neutral" dot>
                  Deleted
                </Badge>
              ) : (
                <Badge tone="neutral">Not created</Badge>
              )
            }
          >
            {order.report ? (
              <DetailList
                items={[
                  {
                    label: access.state === "expired" ? "Expired" : "Access until",
                    value: <When value={order.report.expires_at} stacked />,
                  },
                  {
                    label: "Email sent",
                    value: order.report.email_sent_at ? (
                      <When value={order.report.email_sent_at} stacked />
                    ) : (
                      "Not yet"
                    ),
                  },
                  {
                    label: "Downloads",
                    value: (
                      <span>
                        <span className="font-medium tabular-nums">
                          {formatNumber(order.report.download_count)}
                        </span>
                        {order.report.last_download_at ? (
                          <span className="block text-xs text-ink-soft">
                            last {formatRelative(order.report.last_download_at)}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  { label: "File size", value: formatBytes(order.report.size_bytes) },
                  { label: "Created", value: formatDateTime(order.report.created_at) },
                  {
                    label: "Deleted",
                    value: order.report.deleted_at ? formatDateTime(order.report.deleted_at) : null,
                    hideEmpty: true,
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-ink-soft">
                {GENERATING_STATUSES.includes(order.status)
                  ? "The PDF is created when all six sections are written."
                  : "No PDF was created for this order."}
              </p>
            )}
          </Panel>
        </div>

        {/* Main column. */}
        <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Panel title="Summary">
            <KeyValueList
              layout="grid"
              items={[
                {
                  label: "Amount paid",
                  value: (
                    <span className="text-base font-semibold tabular-nums" dir="ltr">
                      {formatMoney(order.amount_cents, order.currency)}
                    </span>
                  ),
                },
                {
                  label: "List price",
                  value: (
                    <span className="tabular-nums" dir="ltr">
                      {formatMoney(order.list_price_cents, order.currency)}
                    </span>
                  ),
                },
                {
                  label: "Discount",
                  value: discount ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {order.discount_code ? (
                        <Badge tone="gold" className="font-mono">
                          {order.discount_code}
                        </Badge>
                      ) : null}
                      <span className="tabular-nums" dir="ltr">
                        −{formatMoney(order.discount_cents, order.currency)}
                      </span>
                    </span>
                  ) : null,
                },
                { label: "Payment provider", value: humanize(order.payment_provider) },
                {
                  label: "Checkout session",
                  value: <Mono value={order.provider_session_id} label="checkout session id" />,
                },
                {
                  label: "Payment id",
                  value: <Mono value={order.provider_payment_id} label="payment id" />,
                },
                { label: "Created", value: <When value={order.created_at} /> },
                { label: "Paid", value: <When value={order.paid_at} /> },
                {
                  label: "Generation started",
                  value: <When value={order.generation_started_at} />,
                },
                { label: "Ready", value: <When value={order.ready_at} /> },
                {
                  label: "Report language",
                  value: LOCALE_NAMES[order.locale] ?? order.locale,
                },
                {
                  label: "Marketing emails",
                  value: order.marketing_opt_in ? "Opted in" : "Not opted in",
                },
                {
                  label: "Prompt versions",
                  value: order.prompt_version_ids.length ? (
                    <span className="font-mono text-[0.8125rem]">
                      {order.prompt_version_ids.map((v) => `#${v}`).join(" · ")}
                    </span>
                  ) : null,
                },
                { label: "Last updated", value: <When value={order.updated_at} /> },
              ]}
            />
          </Panel>

          <Panel
            title="Report sections"
            description={`${order.progress.sections_done} of ${order.progress.sections_total} written by the AI.`}
            padding="none"
          >
            <SectionList
              sections={order.sections}
              orderStatus={order.status}
              locale={order.locale}
            />
          </Panel>

          <Panel title="Payment events" padding="none">
            <PaymentEvents events={order.payment_events} />
          </Panel>

          <Panel
            title="Jobs"
            description="Background jobs of this order, oldest first."
            padding="none"
            actions={
              <AdminButtonLink href="/admin/jobs" size="sm" variant="ghost" iconEnd="arrowRight">
                All jobs
              </AdminButtonLink>
            }
          >
            <JobList
              jobs={order.jobs}
              emptyTitle="No jobs yet"
              emptyDescription="Jobs are created when the payment arrives."
            />
          </Panel>
        </div>

        {/* Side column, bottom. */}
        <div className="min-w-0 space-y-6 xl:col-start-2 xl:row-start-2">
          <Panel title="Customer">
            <DetailList
              items={[
                { label: "Name", value: order.display_name },
                {
                  label: "Email",
                  value: (
                    <span className="flex min-w-0 items-center justify-end gap-0.5">
                      <a
                        href={`mailto:${order.email}`}
                        dir="ltr"
                        className="min-w-0 break-all underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
                      >
                        {order.email}
                      </a>
                      <CopyButton value={order.email} label="Copy email" />
                    </span>
                  ),
                },
                {
                  label: "Birth date",
                  value: order.birth_date ? formatDate(order.birth_date) : null,
                },
                { label: "Birth time", value: order.birth_time },
                {
                  label: "Birthplace",
                  value: order.place_label ? <span dir="auto">{order.place_label}</span> : null,
                },
                { label: "Time zone", value: order.timezone, mono: true },
              ]}
            />
          </Panel>

          <Panel title="Chart">
            <ChartSummary chart={order.chart} />
          </Panel>
        </div>
      </div>
    </>
  );
}
