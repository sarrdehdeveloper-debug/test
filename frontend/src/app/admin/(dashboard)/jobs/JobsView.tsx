"use client";

import { useState } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { JobList, jobKindLabel } from "@/components/admin/orders/JobList";
import { orderActionErrorMessage } from "@/components/admin/orders/orderHelpers";
import { Tabs, tabPanelProps, type TabItem } from "@/components/admin/prompts/Tabs";
import { adminApi } from "@/lib/admin/api";
import { formatTime, shortId } from "@/lib/admin/format";
import { useAdminMutation, useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import { JOB_STATUSES, type AdminJob, type AdminPage, type JobStatus } from "@/lib/admin/types";

const PAGE_SIZE = 20;
const LIVE_REFRESH_MS = 10_000;
const COUNT_REFRESH_MS = 30_000;

const TAB_ORDER: JobStatus[] = ["failed", "pending", "running", "done"];
const TAB_LABELS: Record<JobStatus, string> = {
  failed: "Failed",
  pending: "Pending",
  running: "Running",
  done: "Done",
};
const DESCRIPTIONS: Record<JobStatus, { title: string; text: string }> = {
  failed: {
    title: "No failed jobs",
    text: "Everything went through. Jobs that run out of attempts show up here so you can retry them.",
  },
  pending: {
    title: "Nothing waiting",
    text: "Queued jobs appear here until the worker picks them up.",
  },
  running: { title: "Nothing running", text: "The worker is idle right now." },
  done: { title: "No finished jobs yet", text: "Completed jobs are listed here, newest first." },
};

function isJobStatus(value: string | null): value is JobStatus {
  return !!value && (JOB_STATUSES as readonly string[]).includes(value);
}

/** Total of one status (page_size=1 keeps the request tiny). */
function useJobCount(status: JobStatus) {
  const query = useAdminQuery<AdminPage<AdminJob>>("/jobs", {
    query: { status, page_size: 1 },
    refreshInterval: COUNT_REFRESH_MS,
  });
  return { total: query.data?.total, refetch: query.refetch };
}

/** `/admin/jobs`: background job queue by status (failed first) with retry for failed jobs. */
export function JobsView() {
  const [params, setParams] = useUrlParams();
  const rawStatus = params.get("status");
  const status: JobStatus = isJobStatus(rawStatus) ? rawStatus : "failed";
  const page = parsePage(params.get("page"));
  const [toRetry, setToRetry] = useState<AdminJob | null>(null);

  const live = status === "pending" || status === "running";
  const jobs = useAdminQuery<AdminPage<AdminJob>>("/jobs", {
    query: { status, page, page_size: PAGE_SIZE },
    refreshInterval: live ? LIVE_REFRESH_MS : 0,
  });
  const counts = {
    failed: useJobCount("failed"),
    pending: useJobCount("pending"),
    running: useJobCount("running"),
    done: useJobCount("done"),
  };

  const refreshAll = async () => {
    await Promise.all([jobs.refetch(), ...TAB_ORDER.map((s) => counts[s].refetch())]);
  };

  const retry = useAdminMutation(
    (job: AdminJob) => adminApi.post<AdminJob>(`/jobs/${job.id}/retry`),
    {
      errorMessage: false, // shown inside the confirmation dialog
      successMessage: (job) => `${jobKindLabel(job.kind)} job #${job.id} is queued again`,
      onSuccess: () => refreshAll(),
      onError: (error) => {
        if (error.code === "job_not_failed") void refreshAll();
      },
    },
  );

  const items: TabItem<JobStatus>[] = TAB_ORDER.map((value) => ({
    value,
    label: TAB_LABELS[value],
    count: counts[value].total,
    countTone: value === "failed" ? "danger" : value === "running" ? "warning" : "neutral",
  }));

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Background work of the worker: report generation, delivery emails and clean-up. Failed jobs ran out of attempts and need a look."
        actions={
          <>
            {jobs.updatedAt ? (
              <span className="text-xs text-ink-soft" aria-live="polite">
                Updated {formatTime(jobs.updatedAt)}
              </span>
            ) : null}
            <AdminButton
              size="sm"
              icon="refresh"
              loading={jobs.fetching && !jobs.loading}
              onClick={() => void refreshAll()}
            >
              Refresh
            </AdminButton>
          </>
        }
      />

      <Panel
        padding="none"
        footer={
          jobs.data && jobs.data.total > 0 ? (
            <Pagination
              page={page}
              pageSize={jobs.data.page_size}
              total={jobs.data.total}
              itemLabel={jobs.data.total === 1 ? "job" : "jobs"}
              disabled={jobs.fetching}
              onPageChange={(next) => setParams({ page: next > 1 ? next : null })}
            />
          ) : null
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 px-4 py-3 sm:px-5">
          <Tabs
            label="Job status"
            idBase="jobs"
            variant="pills"
            className="max-sm:grid max-sm:w-full max-sm:grid-cols-2"
            items={items}
            value={status}
            onChange={(value) =>
              setParams({ status: value === "failed" ? null : value, page: null })
            }
          />
          {live ? <span className="text-xs text-ink-soft">Refreshes every 10 seconds</span> : null}
        </div>
        <div {...tabPanelProps("jobs", status)} className="focus:outline-none">
          <JobList
            jobs={jobs.data?.items}
            loading={jobs.loading}
            stale={jobs.isPlaceholder}
            error={jobs.error}
            onRetryLoad={() => void jobs.refetch()}
            onRetryJob={(job) => {
              retry.reset();
              setToRetry(job);
            }}
            showOrder
            emptyTitle={DESCRIPTIONS[status].title}
            emptyDescription={DESCRIPTIONS[status].text}
          />
        </div>
      </Panel>

      <ConfirmDialog
        open={toRetry !== null}
        onClose={() => setToRetry(null)}
        title={toRetry ? `Retry job #${toRetry.id}?` : "Retry job?"}
        description={
          toRetry?.kind === "generate_report"
            ? "The job goes back to the queue with fresh attempts and its order is queued again. Sections that already finished are kept."
            : "The job goes back to the queue with fresh attempts and runs within a few seconds."
        }
        confirmLabel="Retry job"
        onConfirm={() => (toRetry ? retry.mutateAsync(toRetry) : undefined)}
        formatError={orderActionErrorMessage}
      >
        {toRetry ? (
          <p className="text-ink-soft">
            {jobKindLabel(toRetry.kind)}
            {toRetry.order_id ? (
              <>
                {" "}
                for order <span className="font-mono text-ink">#{shortId(toRetry.order_id)}</span>
              </>
            ) : null}{" "}
            · failed after {toRetry.attempts} of {toRetry.max_attempts} attempts.
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
