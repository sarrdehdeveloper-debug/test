"use client";

import { useEffect } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { Panel } from "@/components/admin/Panel";

/** Unexpected render error inside a dashboard page: keeps the shell, offers a retry. */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel className="mt-2">
      <div role="alert">
        <EmptyState
          icon="alert"
          tone="alert"
          title="This page ran into a problem"
          description={
            <>
              Try again; if it keeps happening, reload the page.
              {error.digest ? (
                <span className="mt-1 block font-mono text-xs text-stone-400">
                  ref: {error.digest}
                </span>
              ) : null}
            </>
          }
          action={
            <>
              <AdminButton variant="primary" icon="refresh" onClick={() => retry()}>
                Try again
              </AdminButton>
              <AdminButtonLink href="/admin" icon="overview">
                Overview
              </AdminButtonLink>
            </>
          }
        />
      </div>
    </Panel>
  );
}
