"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatRelative, humanize, shortId } from "@/lib/admin/format";
import type { AdminJob } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { ErrorText } from "./ErrorText";

const KIND_LABELS: Record<string, string> = {
  generate_report: "Generate report",
  send_report_email: "Send report email",
  cleanup: "Cleanup",
};

export function jobKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? humanize(kind);
}

function Time({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span className="whitespace-nowrap">
      {label}{" "}
      <time dateTime={value} title={formatDateTime(value, { seconds: true })} className="text-ink">
        {formatRelative(value)}
      </time>
    </span>
  );
}

export interface JobListProps {
  jobs: AdminJob[] | undefined;
  loading?: boolean;
  /** Dim while a new page / filter loads. */
  stale?: boolean;
  error?: unknown;
  onRetryLoad?: () => void;
  /** Shows a "Retry" button on failed jobs. */
  onRetryJob?: (job: AdminJob) => void;
  /** Link each job to its order (jobs page). */
  showOrder?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  className?: string;
}

/**
 * Background jobs as a list of rows: kind, status, attempts, timing, the order it belongs to and an
 * expandable `last_error`. Used by the Jobs page and the order detail page.
 */
export function JobList({
  jobs,
  loading = false,
  stale = false,
  error,
  onRetryLoad,
  onRetryJob,
  showOrder = false,
  emptyTitle = "No jobs",
  emptyDescription,
  className,
}: JobListProps) {
  if (loading && !jobs?.length) {
    return (
      <ul aria-busy="true" className={cn("divide-y divide-stone-100", className)}>
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="space-y-2 px-4 py-4 sm:px-5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </li>
        ))}
      </ul>
    );
  }
  if (error && !jobs?.length) return <ErrorState error={error} onRetry={onRetryLoad} compact />;
  if (!jobs?.length) {
    return <EmptyState compact icon="jobs" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul
      aria-busy={stale || undefined}
      className={cn(
        "divide-y divide-stone-100 transition-opacity duration-200",
        stale && "opacity-55",
        className,
      )}
    >
      {jobs.map((job) => (
        <li key={job.id} className="px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-ink">{jobKindLabel(job.kind)}</span>
                <StatusBadge kind="job" status={job.status} />
                <span className="font-mono text-xs text-ink-soft">#{job.id}</span>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-soft">
                <span className="whitespace-nowrap">
                  Attempts{" "}
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      job.attempts >= job.max_attempts && job.status === "failed"
                        ? "text-danger"
                        : "text-ink",
                    )}
                  >
                    {job.attempts} / {job.max_attempts}
                  </span>
                </span>
                <Time label="Created" value={job.created_at} />
                {job.status === "pending" ? <Time label="Runs" value={job.run_at} /> : null}
                <Time label="Finished" value={job.finished_at} />
                {showOrder && job.order_id ? (
                  <span className="whitespace-nowrap">
                    Order{" "}
                    <Link
                      href={`/admin/orders/${job.order_id}`}
                      className="font-mono font-medium text-ink underline decoration-gold/50 underline-offset-2 hover:decoration-gold"
                    >
                      #{shortId(job.order_id)}
                    </Link>
                  </span>
                ) : null}
              </p>
            </div>
            {onRetryJob && job.status === "failed" ? (
              <AdminButton size="sm" icon="refresh" onClick={() => onRetryJob(job)}>
                Retry<span className="sr-only"> job #{job.id}</span>
              </AdminButton>
            ) : null}
          </div>
          {job.last_error ? (
            <ErrorText
              text={job.last_error}
              label={job.status === "failed" ? "Last error" : "Earlier error"}
              className="mt-2.5"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
