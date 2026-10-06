/**
 * Tiny global toast store (no context needed): call `toast.success("Saved")` from anywhere in the
 * dashboard; `<Toaster />` (mounted once by AdminShell and the login page) renders the queue in
 * aria-live regions.
 */

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** ms before auto-dismiss; 0 = sticky. Defaults: 5 s, errors 8 s. */
  duration: number;
  action?: ToastAction;
}

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: ToastAction;
}

type Listener = () => void;

const MAX_TOASTS = 4;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): Toast[] {
  return toasts;
}

const EMPTY: Toast[] = [];
/** Server snapshot for useSyncExternalStore (no toasts during SSR). */
export function getServerToasts(): Toast[] {
  return EMPTY;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

export function clearToasts(): void {
  toasts = [];
  emit();
}

function push(tone: ToastTone, title: string, options: ToastOptions = {}): number {
  const id = nextId++;
  const duration = options.duration ?? (tone === "error" ? 8000 : 5000);
  // Same message already showing → replace it instead of stacking duplicates.
  const rest = toasts.filter((t) => !(t.title === title && t.tone === tone));
  toasts = [
    ...rest,
    { id, tone, title, duration, description: options.description, action: options.action },
  ].slice(-MAX_TOASTS);
  emit();
  return id;
}

export const toast = {
  success: (title: string, options?: ToastOptions) => push("success", title, options),
  error: (title: string, options?: ToastOptions) => push("error", title, options),
  info: (title: string, options?: ToastOptions) => push("info", title, options),
  warning: (title: string, options?: ToastOptions) => push("warning", title, options),
  dismiss: dismissToast,
};
