"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface ModalProps {
  open: boolean;
  /** Called on Esc, the close button, a backdrop click (when `dismissible`) and by your buttons. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Button row at the bottom (end-aligned). */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Esc / backdrop / close button allowed (default true). Set false while saving. */
  dismissible?: boolean;
  /** `alertdialog` for confirmations. */
  role?: "dialog" | "alertdialog";
  className?: string;
}

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

/**
 * Accessible modal on the native <dialog> (focus trap, Esc, inert page, focus returns to the
 * trigger). Content mounts only while open.
 *   <Modal open={open} onClose={() => setOpen(false)} title="Choose an image" size="xl">…</Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  role = "dialog",
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  // Keep the page behind from scrolling while the modal is open.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role === "alertdialog" ? "alertdialog" : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        // React bubbles `cancel` through the component tree: without this, Esc in a nested modal
        // (e.g. the media library opened from an editor dialog) would close its parent as well.
        event.stopPropagation();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        // A click on the ::backdrop targets the dialog element itself.
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-stone-200 bg-white p-0 text-ink shadow-lift",
        "backdrop:bg-night/55 backdrop:backdrop-blur-[2px] open:flex open:flex-col",
        SIZES[size],
        className,
      )}
    >
      {open ? (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-stone-200/80 px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-serif text-xl leading-snug font-semibold text-ink">
                {title}
              </h2>
              {description ? (
                <div id={descriptionId} className="mt-1 text-sm text-ink-soft">
                  {description}
                </div>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                className="-me-1.5 -mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-ink"
                aria-label="Close"
              >
                <Icon name="close" className="size-4" />
              </button>
            ) : null}
          </header>
          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          ) : null}
          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200/80 bg-stone-50/60 px-5 py-3">
              {footer}
            </footer>
          ) : null}
        </>
      ) : null}
    </dialog>
  );
}
