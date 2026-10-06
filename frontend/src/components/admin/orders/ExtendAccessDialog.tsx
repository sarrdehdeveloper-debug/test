"use client";

import { useId, useState, type FormEvent } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { Field, TextInput } from "@/components/admin/form";
import { Modal } from "@/components/admin/Modal";
import { formatDateTime, formatRelative } from "@/lib/admin/format";
import { MAX_EXTEND_HOURS } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import {
  extendedExpiry,
  hoursLabel,
  orderActionErrorMessage,
  parseExtendHours,
} from "./orderHelpers";

const PRESETS = [24, 48, 72, MAX_EXTEND_HOURS];

export interface ExtendAccessDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current `report.expires_at`. */
  expiresAt: string;
  /** Resolves on success; a rejection is shown inside the dialog. */
  onSubmit: (hours: number) => Promise<unknown>;
}

/** "Extend access" modal: hours input (1–168) with presets and a live preview of the new expiry. */
export function ExtendAccessDialog({
  open,
  onClose,
  expiresAt,
  onSubmit,
}: ExtendAccessDialogProps) {
  const formId = useId();
  const [raw, setRaw] = useState("24");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const parsed = parseExtendHours(raw);
  const error = "error" in parsed ? parsed.error : null;
  const expired = Date.parse(expiresAt) <= now;
  const preview = "hours" in parsed ? extendedExpiry(expiresAt, parsed.hours, now) : null;

  const close = () => {
    if (pending) return;
    setRaw("24");
    setTouched(false);
    setServerError(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!("hours" in parsed) || pending) return;
    setPending(true);
    setServerError(null);
    try {
      await onSubmit(parsed.hours);
      setPending(false);
      setRaw("24");
      setTouched(false);
      onClose();
    } catch (err) {
      setPending(false);
      setServerError(orderActionErrorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!pending}
      title="Extend download access"
      description={
        expired ? (
          <>
            Access ended {formatRelative(expiresAt, now)} ({formatDateTime(expiresAt)}). The
            extension counts from now.
          </>
        ) : (
          <>
            Access currently ends {formatRelative(expiresAt, now)} ({formatDateTime(expiresAt)}).
            The extension is added to that time.
          </>
        )
      }
      footer={
        <>
          <AdminButton onClick={close} disabled={pending}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" form={formId} variant="primary" loading={pending}>
            Extend access
          </AdminButton>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {serverError ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        ) : null}
        <Field
          label="Extend by"
          hint={`Whole hours, 1 to ${MAX_EXTEND_HOURS} (7 days).`}
          error={touched || raw !== "" ? (error ?? undefined) : undefined}
          required
        >
          <div className="max-w-48">
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_EXTEND_HOURS}
              step={1}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              onBlur={() => setTouched(true)}
              endAdornment={<span className="text-xs">hours</span>}
              className="pe-14 tabular-nums"
              dir="ltr"
            />
          </div>
        </Field>
        <div role="group" aria-label="Quick choices" className="flex flex-wrap gap-2">
          {PRESETS.map((hours) => {
            const active = "hours" in parsed && parsed.hours === hours;
            return (
              <button
                key={hours}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setRaw(String(hours));
                  setTouched(true);
                }}
                className={cn(
                  "h-8 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors",
                  active
                    ? "border-gold bg-gold-pale/70 text-gold-deep"
                    : "border-stone-300 bg-white text-ink-soft hover:border-stone-400 hover:text-ink",
                )}
              >
                +{hoursLabel(hours)}
              </button>
            );
          })}
        </div>
        <p
          className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-ink-soft"
          aria-live="polite"
        >
          {preview ? (
            <>
              New expiry:{" "}
              <strong className="font-semibold text-ink">{formatDateTime(preview)}</strong>
            </>
          ) : (
            "Enter the number of hours to see the new expiry."
          )}
        </p>
      </form>
    </Modal>
  );
}
