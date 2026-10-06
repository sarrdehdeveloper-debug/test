"use client";

import type { ReactNode } from "react";
import { toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { cn } from "@/lib/cn";
import { AdminButton, AdminButtonLink } from "./AdminButton";
import { EmptyState } from "./EmptyState";

/** Grey shimmering block for loading skeletons: `<Skeleton className="h-4 w-32" />`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-stone-200/70", className)}
    />
  );
}

/** Screen-reader announcement + skeleton lines for a loading section. */
export function LoadingState({
  label = "Loading…",
  lines = 3,
  className,
}: {
  label?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i % 3 === 2 ? "w-2/3" : i % 2 ? "w-5/6" : "w-full")}
        />
      ))}
    </div>
  );
}

/** "You don't have permission" (403 or a role the page does not allow), with a way back. */
export function ForbiddenState({
  description,
  action,
  className,
}: {
  description?: ReactNode;
  /** Replaces the default "Back to overview" link (`null` for none). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      icon="lock"
      tone="alert"
      title="You don't have permission to view this"
      description={
        description ?? "Your role does not include this section. Ask an owner if you need access."
      }
      action={
        action === undefined ? (
          <AdminButtonLink href="/admin" size="sm" icon="overview">
            Back to overview
          </AdminButtonLink>
        ) : (
          action
        )
      }
      className={className}
    />
  );
}

export interface ErrorStateProps {
  /** Anything thrown by adminApi (AdminApiError, network error…). */
  error: unknown;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  title?: ReactNode;
  compact?: boolean;
  className?: string;
}

/**
 * Error block for a failed query: 403 → ForbiddenState, 404 → "not found", else the message with
 * a retry button. A 401 renders nothing (the login redirect is already happening).
 *   if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
 */
export function ErrorState({ error, onRetry, title, compact = false, className }: ErrorStateProps) {
  const err = toAdminApiError(error);
  if (err.isUnauthorized) return null;
  if (err.isForbidden) return <ForbiddenState className={className} />;
  return (
    <div role="alert" className={className}>
      <EmptyState
        compact={compact}
        icon="alert"
        tone="alert"
        title={title ?? (err.isNotFound ? "Not found" : "Couldn't load this")}
        description={adminErrorMessage(err)}
        action={
          onRetry && !err.isNotFound ? (
            <AdminButton size="sm" icon="refresh" onClick={onRetry}>
              Try again
            </AdminButton>
          ) : null
        }
      />
    </div>
  );
}
