"use client";

import { useState, type ReactNode } from "react";
import { adminErrorMessage } from "@/lib/admin/errors";
import { AdminButton } from "./AdminButton";
import { Field, TextInput } from "./form";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Runs on confirm. If it returns a promise the button shows a spinner until it settles; the
   * dialog then closes on success and stays open if the promise rejects (use `mutateAsync`).
   */
  onConfirm: () => void | Promise<unknown>;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content (e.g. what will be deleted). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` = red confirm button (deletes, irreversible actions). */
  tone?: "default" | "danger";
  /** Require typing this text (e.g. the slug) before confirming. */
  confirmText?: string;
  /** External loading state (if you do not return a promise). */
  loading?: boolean;
}

/**
 * Confirmation modal (role="alertdialog").
 *   <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} tone="danger"
 *     title="Delete this offer?" description="This cannot be undone." confirmLabel="Delete"
 *     onConfirm={() => remove.mutateAsync(toDelete.id)} />
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  confirmText,
  loading = false,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState("");
  // Shown inside the dialog: toasts render below the modal's backdrop.
  const [error, setError] = useState<string | null>(null);
  const busy = pending || loading;
  const blocked = Boolean(confirmText) && typed.trim() !== confirmText;

  const close = () => {
    if (busy) return;
    setTyped("");
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (blocked || busy) return;
    const result = onConfirm();
    if (!(result instanceof Promise)) return;
    setPending(true);
    setError(null);
    try {
      await result;
      setPending(false);
      setTyped("");
      onClose();
    } catch (err) {
      setPending(false);
      setError(adminErrorMessage(err, { allowAbort: true }));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
      dismissible={!busy}
      footer={
        <>
          <AdminButton onClick={close} disabled={busy}>
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={confirm}
            loading={busy}
            disabled={blocked}
          >
            {confirmLabel}
          </AdminButton>
        </>
      }
    >
      {children || confirmText || error ? (
        <div className="space-y-4 text-sm text-ink">
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {children}
          {confirmText ? (
            <Field
              label={
                <>
                  Type{" "}
                  <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.8rem]">
                    {confirmText}
                  </code>{" "}
                  to confirm
                </>
              }
            >
              <TextInput
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void confirm();
                  }
                }}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
