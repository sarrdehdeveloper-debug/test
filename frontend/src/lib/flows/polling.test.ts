import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { OrderStatus, OrderStatusOut } from "@/lib/types";
import {
  errorRetryDelay,
  nextPollDelay,
  OrderPoller,
  POLL_FAST_MS,
  POLL_SLOW_MS,
  SLOW_AFTER_MS,
  shouldPoll,
  type PollSnapshot,
} from "./polling";

function order(status: OrderStatus, sectionsDone = 0): OrderStatusOut {
  return {
    order_id: "11111111-1111-4111-8111-111111111111",
    status,
    locale: "en",
    email_masked: "a***@example.com",
    amount_cents: 2900,
    currency: "USD",
    created_at: "2026-10-06T12:00:00Z",
    paid_at: status === "awaiting_payment" ? null : "2026-10-06T12:01:00Z",
    ready_at: null,
    access_expires_at: null,
    download_available: status === "ready",
    progress: { sections_done: sectionsDone, sections_total: 6 },
    signs: {
      sun: "leo",
      moon: "pisces",
      ascendant: "scorpio",
      year_animal: "horse",
      month_animal: "monkey",
      day_animal: "rabbit",
    },
  };
}

describe("schedule rules", () => {
  it("polls only while the report is on its way", () => {
    for (const s of ["paid", "queued", "generating"] as const) expect(shouldPoll(s)).toBe(true);
    for (const s of [
      "awaiting_payment",
      "ready",
      "generation_failed",
      "expired",
      "abandoned",
      "refunded",
    ] as const) {
      expect(shouldPoll(s)).toBe(false);
    }
    expect(shouldPoll("awaiting_payment", true)).toBe(true);
    expect(shouldPoll("ready", true)).toBe(false);
  });

  it("backs off from 3 s to 10 s after two minutes", () => {
    expect(nextPollDelay("generating", 0)).toBe(POLL_FAST_MS);
    expect(nextPollDelay("generating", SLOW_AFTER_MS - 1)).toBe(POLL_FAST_MS);
    expect(nextPollDelay("queued", SLOW_AFTER_MS)).toBe(POLL_SLOW_MS);
    expect(nextPollDelay("ready", 0)).toBeNull();
  });

  it("retries failures exponentially, honouring Retry-After", () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => errorRetryDelay(n))).toEqual([
      3_000, 6_000, 12_000, 24_000, 30_000, 30_000,
    ]);
    expect(errorRetryDelay(1, 20)).toBe(20_000);
    expect(errorRetryDelay(1, 0)).toBe(3_000);
  });
});

describe("OrderPoller", () => {
  let hidden = false;
  let snapshots: PollSnapshot[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    hidden = false;
    snapshots = [];
  });
  afterEach(() => vi.useRealTimers());

  function makePoller(
    responses: (OrderStatusOut | Error)[],
    options: { awaitingConfirmation?: boolean } = {},
  ) {
    const queue = [...responses];
    const fetchStatus = vi.fn(async () => {
      const next = queue.length > 1 ? queue.shift()! : queue[0];
      if (next instanceof Error) throw next;
      return next;
    });
    const poller = new OrderPoller({
      fetchStatus,
      onChange: (s) => snapshots.push(s),
      isHidden: () => hidden,
      ...options,
    });
    return { poller, fetchStatus };
  }

  const last = () => snapshots[snapshots.length - 1];

  it("polls every 3 s until the report is ready, then stops", async () => {
    const { poller, fetchStatus } = makePoller([
      order("queued"),
      order("generating", 2),
      order("generating", 6),
      order("ready", 6),
    ]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ phase: "ready", active: true });
    expect(last().order?.status).toBe("queued");

    await vi.advanceTimersByTimeAsync(POLL_FAST_MS);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(last().order?.progress.sections_done).toBe(2);

    await vi.advanceTimersByTimeAsync(2 * POLL_FAST_MS);
    expect(fetchStatus).toHaveBeenCalledTimes(4);
    expect(last()).toMatchObject({ phase: "ready", active: false });
    expect(last().order?.status).toBe("ready");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(4);
  });

  it("slows down to 10 s after two minutes", async () => {
    const { poller, fetchStatus } = makePoller([order("generating", 1)]);
    poller.start();
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS);
    const calls = fetchStatus.mock.calls.length;
    expect(calls).toBe(1 + SLOW_AFTER_MS / POLL_FAST_MS);
    await vi.advanceTimersByTimeAsync(POLL_FAST_MS);
    expect(fetchStatus).toHaveBeenCalledTimes(calls); // next one is 10 s after the last
    await vi.advanceTimersByTimeAsync(POLL_SLOW_MS);
    expect(fetchStatus.mock.calls.length).toBeGreaterThan(calls);
    poller.stop();
  });

  it("does not poll an unpaid order unless returning from checkout", async () => {
    const plain = makePoller([order("awaiting_payment")]);
    plain.poller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(plain.fetchStatus).toHaveBeenCalledTimes(1);

    const returning = makePoller([order("awaiting_payment"), order("queued"), order("ready")], {
      awaitingConfirmation: true,
    });
    returning.poller.start();
    await vi.advanceTimersByTimeAsync(2 * POLL_FAST_MS);
    expect(returning.fetchStatus).toHaveBeenCalledTimes(3);
    expect(last().order?.status).toBe("ready");
  });

  it("pauses while the tab is hidden and resumes at once when visible", async () => {
    const { poller, fetchStatus } = makePoller([order("generating", 1)]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    hidden = true;
    await vi.advanceTimersByTimeAsync(60_000);
    // The timer fired once, saw the hidden tab and parked the request.
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    hidden = false;
    poller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    // Becoming visible again without a parked request does not fetch twice.
    poller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("stops for good on 404", async () => {
    const { poller, fetchStatus } = makePoller([new ApiError(404, "not_found")]);
    poller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ phase: "notFound", active: false, order: null });
  });

  it("retries network errors with backoff and keeps the last good order", async () => {
    const { poller, fetchStatus } = makePoller([
      order("generating", 3),
      ApiError.network(),
      ApiError.network(),
      order("generating", 4),
    ]);
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_FAST_MS); // ok, then 1st failure
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(last()).toMatchObject({ phase: "ready", failures: 1 });
    expect(last().order?.progress.sections_done).toBe(3);
    await vi.advanceTimersByTimeAsync(3_000); // 2nd failure after 3 s
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(last().failures).toBe(2);
    await vi.advanceTimersByTimeAsync(5_999);
    expect(fetchStatus).toHaveBeenCalledTimes(3); // waits 6 s
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchStatus).toHaveBeenCalledTimes(4);
    expect(last()).toMatchObject({ failures: 0, error: null });
    poller.stop();
  });

  it("keeps retrying when the very first request fails", async () => {
    const { poller, fetchStatus } = makePoller([ApiError.network(), order("ready")]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ phase: "loading", failures: 1, active: true });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(last()).toMatchObject({ phase: "ready", active: false });
  });

  it("refresh() fetches immediately and stop() cancels everything", async () => {
    const { poller, fetchStatus } = makePoller([order("awaiting_payment")]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    poller.stop();
    poller.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });
});
