import { isApiError } from "@/lib/api/errors";
import type { OrderStatus, OrderStatusOut } from "@/lib/types";

/**
 * Order-status polling (framework-agnostic, unit-tested; the React hook is
 * src/components/flows/order/useOrderStatus.ts).
 *
 * - Poll every 3 s while the report is on its way (paid / queued / generating), back off to 10 s
 *   after 2 minutes, stop on any other status (ready, failed, expired, ...).
 * - `awaitingConfirmation` (the visitor came back from checkout with ?paid=1): keep polling an
 *   `awaiting_payment` order too, because the payment webhook can arrive a little later.
 * - Pause while the tab is hidden; resume with an immediate request when it is visible again.
 * - Network / server errors retry with exponential backoff (3 s … 30 s); 429 honours Retry-After.
 *   A 404 (unknown order or wrong token) is final.
 */

export const POLL_FAST_MS = 3_000;
export const POLL_SLOW_MS = 10_000;
export const SLOW_AFTER_MS = 120_000;
export const ERROR_RETRY_MAX_MS = 30_000;

export const IN_PROGRESS_STATUSES: readonly OrderStatus[] = ["paid", "queued", "generating"];

export function isInProgress(status: OrderStatus): boolean {
  return IN_PROGRESS_STATUSES.includes(status);
}

/** Whether an order in `status` should be polled again. */
export function shouldPoll(status: OrderStatus, awaitingConfirmation = false): boolean {
  return isInProgress(status) || (awaitingConfirmation && status === "awaiting_payment");
}

/** Delay before the next status request after a successful one; null = stop polling. */
export function nextPollDelay(
  status: OrderStatus,
  elapsedMs: number,
  awaitingConfirmation = false,
): number | null {
  if (!shouldPoll(status, awaitingConfirmation)) return null;
  return elapsedMs >= SLOW_AFTER_MS ? POLL_SLOW_MS : POLL_FAST_MS;
}

/** Backoff after `failures` consecutive failed requests (1 -> 3 s, 2 -> 6 s, ... max 30 s). */
export function errorRetryDelay(failures: number, retryAfterSeconds?: number | null): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds !== null && retryAfterSeconds > 0) {
    return Math.min(Math.max(retryAfterSeconds * 1000, POLL_FAST_MS), 5 * 60_000);
  }
  const exp = POLL_FAST_MS * 2 ** Math.max(0, failures - 1);
  return Math.min(exp, ERROR_RETRY_MAX_MS);
}

export type PollPhase = "loading" | "ready" | "notFound";

export interface PollSnapshot {
  phase: PollPhase;
  /** Last successfully loaded order (kept while later requests fail). */
  order: OrderStatusOut | null;
  /** Error of the latest request (null after a success). */
  error: unknown;
  /** Consecutive failed requests. */
  failures: number;
  /** A request or timer is pending (UI may show a subtle "updating" state). */
  active: boolean;
}

export const INITIAL_SNAPSHOT: PollSnapshot = {
  phase: "loading",
  order: null,
  error: null,
  failures: 0,
  active: true,
};

export interface PollerOptions {
  fetchStatus: (signal: AbortSignal) => Promise<OrderStatusOut>;
  onChange: (snapshot: PollSnapshot) => void;
  awaitingConfirmation?: boolean;
  now?: () => number;
  isHidden?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Drives the polling loop. Call `start()` once, `visibilityChanged()` on `visibilitychange`,
 * `refresh()` to fetch now (e.g. after an action), and `stop()` on unmount.
 */
export class OrderPoller {
  private snapshot: PollSnapshot = INITIAL_SNAPSHOT;
  private startedAt = 0;
  private timer: unknown = null;
  private controller: AbortController | null = null;
  private inFlight = false;
  /** A request is due but was postponed because the tab is hidden. */
  private due = false;
  private stopped = false;
  private readonly opts: Required<Omit<PollerOptions, "awaitingConfirmation">> & {
    awaitingConfirmation: boolean;
  };

  constructor(options: PollerOptions) {
    this.opts = {
      awaitingConfirmation: false,
      now: () => Date.now(),
      isHidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      ...options,
    };
  }

  get current(): PollSnapshot {
    return this.snapshot;
  }

  start(): void {
    this.stopped = false;
    this.startedAt = this.opts.now();
    void this.request();
  }

  stop(): void {
    this.stopped = true;
    this.clear();
    this.controller?.abort();
    this.controller = null;
    this.inFlight = false;
  }

  /** Fetch now (cancels a scheduled request). */
  refresh(): void {
    if (this.stopped) return;
    this.clear();
    void this.request();
  }

  /** Keep polling an awaiting_payment order (e.g. after returning from checkout). */
  setAwaitingConfirmation(value: boolean): void {
    this.opts.awaitingConfirmation = value;
  }

  visibilityChanged(): void {
    if (this.stopped || this.opts.isHidden()) return;
    if (this.due && !this.inFlight) {
      this.due = false;
      void this.request();
    }
  }

  private clear() {
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = null;
    this.due = false;
  }

  private emit(next: Partial<PollSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.opts.onChange(this.snapshot);
  }

  private schedule(delay: number | null) {
    if (this.stopped) return;
    if (delay === null) {
      this.emit({ active: false });
      return;
    }
    this.emit({ active: true });
    this.timer = this.opts.setTimer(() => {
      this.timer = null;
      if (this.stopped) return;
      if (this.opts.isHidden()) {
        this.due = true; // resumed by visibilityChanged()
        return;
      }
      void this.request();
    }, delay);
  }

  private async request(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const order = await this.opts.fetchStatus(controller.signal);
      if (controller.signal.aborted || this.stopped) return;
      this.inFlight = false;
      this.emit({ phase: "ready", order, error: null, failures: 0 });
      const elapsed = this.opts.now() - this.startedAt;
      this.schedule(nextPollDelay(order.status, elapsed, this.opts.awaitingConfirmation));
    } catch (err) {
      if (controller.signal.aborted || this.stopped) return;
      this.inFlight = false;
      if (isApiError(err) && err.isNotFound) {
        this.emit({ phase: "notFound", error: err, active: false });
        return;
      }
      const failures = this.snapshot.failures + 1;
      this.emit({ error: err, failures });
      const last = this.snapshot.order;
      // Keep retrying while the order may still change (or nothing was loaded yet).
      const keepGoing = !last || shouldPoll(last.status, this.opts.awaitingConfirmation);
      const retryAfter = isApiError(err) ? err.retryAfter : null;
      this.schedule(keepGoing ? errorRetryDelay(failures, retryAfter) : null);
    }
  }
}
