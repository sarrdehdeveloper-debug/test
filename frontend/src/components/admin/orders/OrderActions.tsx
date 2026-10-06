"use client";

import { useState, type ReactNode } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Icon, type IconName } from "@/components/admin/icons";
import { Panel } from "@/components/admin/Panel";
import { adminApi, type AdminApiError } from "@/lib/admin/api";
import { formatDateTime } from "@/lib/admin/format";
import { useAdminMutation } from "@/lib/admin/hooks";
import type {
  AdminOrderDetail,
  ExtendAccessIn,
  ExtendAccessOut,
  ResendEmailOut,
  RetryGenerationOut,
} from "@/lib/admin/types";
import { ExtendAccessDialog } from "./ExtendAccessDialog";
import { orderActionErrorMessage, orderActions, type ActionState } from "./orderHelpers";

function ActionRow({
  icon,
  title,
  description,
  state,
  children,
}: {
  icon: IconName;
  title: string;
  description: ReactNode;
  state: ActionState;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-pale/50 text-gold-deep ring-1 ring-gold/20 ring-inset"
      >
        <Icon name={icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 className="text-sm font-medium text-ink">{title}</h3>
          {children}
        </div>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">{description}</p>
        {state.reason ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-soft">
            <Icon name="info" className="mt-px size-3.5 shrink-0 text-stone-400" />
            <span>{state.reason}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

type Dialog = "retry" | "resend" | "extend" | null;

export interface OrderActionsProps {
  order: AdminOrderDetail;
  /** Reload the order after an action (or a 409 that means the page is outdated). */
  onChanged: () => void | Promise<void>;
}

/** Retry generation · Resend email · Extend access, each behind a confirmation. */
export function OrderActions({ order, onChanged }: OrderActionsProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [extendKey, setExtendKey] = useState(0);
  const actions = orderActions(order);
  // A 409 means the page shows an outdated state: reload it behind the dialog.
  const refreshOn409 = {
    onError: (error: AdminApiError) => {
      if (error.isConflict) void onChanged();
    },
  };

  const retry = useAdminMutation(
    () => adminApi.post<RetryGenerationOut>(`/orders/${order.id}/retry-generation`),
    {
      errorMessage: false,
      successMessage: (out) =>
        `Generation queued (job #${out.job_id}). This page updates as sections finish.`,
      onSuccess: () => onChanged(),
      ...refreshOn409,
    },
  );
  const resend = useAdminMutation(
    () => adminApi.post<ResendEmailOut>(`/orders/${order.id}/resend-email`),
    {
      errorMessage: false,
      successMessage: () => `Delivery email queued for ${order.email}`,
      onSuccess: () => onChanged(),
      ...refreshOn409,
    },
  );
  const extend = useAdminMutation(
    (body: ExtendAccessIn) =>
      adminApi.post<ExtendAccessOut>(`/orders/${order.id}/extend-access`, body),
    {
      errorMessage: false,
      successMessage: (out) => `Access extended until ${formatDateTime(out.expires_at)}`,
      onSuccess: () => onChanged(),
      ...refreshOn409,
    },
  );

  const stuck = order.status !== "generation_failed";

  return (
    <Panel title="Actions" description="Fix delivery problems for this customer.">
      <ul className="divide-y divide-stone-100">
        <ActionRow
          icon="refresh"
          title="Retry generation"
          state={actions.retry}
          description="Queue the AI generation again. Finished sections are kept; missing ones are written."
        >
          <AdminButton
            size="sm"
            disabled={!actions.retry.enabled}
            onClick={() => setDialog("retry")}
          >
            Retry
          </AdminButton>
        </ActionRow>
        <ActionRow
          icon="orders"
          title="Resend email"
          state={actions.resend}
          description="Email the download link to the customer again."
        >
          <AdminButton
            size="sm"
            disabled={!actions.resend.enabled}
            onClick={() => setDialog("resend")}
          >
            Resend
          </AdminButton>
        </ActionRow>
        <ActionRow
          icon="calendar"
          title="Extend access"
          state={actions.extend}
          description="Give the customer more time to download the report (up to 7 days at a time)."
        >
          <AdminButton
            size="sm"
            disabled={!actions.extend.enabled}
            onClick={() => {
              setExtendKey((key) => key + 1);
              setDialog("extend");
            }}
          >
            Extend
          </AdminButton>
        </ActionRow>
      </ul>

      <ConfirmDialog
        open={dialog === "retry"}
        onClose={() => setDialog(null)}
        title="Retry report generation?"
        description={
          stuck
            ? "This order is paid but its generation is not running. It goes back to the queue and the worker writes the missing sections."
            : "The order goes back to the queue with fresh attempts. Sections that already finished are kept."
        }
        confirmLabel="Retry generation"
        onConfirm={() => retry.mutateAsync()}
        formatError={orderActionErrorMessage}
      >
        {order.last_error ? (
          <p className="text-ink-soft">
            Last error: <span className="text-ink">{order.last_error.split("\n", 1)[0]}</span>
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "resend"}
        onClose={() => setDialog(null)}
        title="Resend the report email?"
        description={
          <>
            A new email with the download link goes to{" "}
            <span className="font-medium text-ink" dir="ltr">
              {order.email}
            </span>
            .
          </>
        }
        confirmLabel="Send email"
        onConfirm={() => resend.mutateAsync()}
        formatError={orderActionErrorMessage}
      >
        {order.report ? (
          <p className="text-ink-soft">
            The access window does not change: it ends {formatDateTime(order.report.expires_at)}.
          </p>
        ) : null}
      </ConfirmDialog>

      {order.report ? (
        <ExtendAccessDialog
          key={extendKey}
          open={dialog === "extend"}
          onClose={() => setDialog(null)}
          expiresAt={order.report.expires_at}
          onSubmit={(hours) => extend.mutateAsync({ hours })}
        />
      ) : null}
    </Panel>
  );
}
