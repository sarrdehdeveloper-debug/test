import type { OrderStatusOut } from "@/lib/types";

/** The visible stages of a paid report, in order. */
export const PROGRESS_STEPS = ["payment", "chart", "writing", "design", "ready"] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];
export type StepState = "done" | "current" | "upcoming";

export const DEFAULT_SECTIONS_TOTAL = 6;

/** Index of the step in progress (PROGRESS_STEPS.length when everything is done). */
function currentIndex(order: Pick<OrderStatusOut, "status" | "progress">): number {
  const { sections_done: done, sections_total: total } = sectionCounts(order);
  switch (order.status) {
    case "awaiting_payment":
    case "abandoned":
      return 0;
    case "paid":
    case "queued":
      return 1;
    case "generating":
    case "generation_failed":
      return done >= total ? 3 : 2;
    default:
      // ready, expired, refunded: the report was (or would have been) delivered.
      return PROGRESS_STEPS.length;
  }
}

export function sectionCounts(order: Pick<OrderStatusOut, "progress">): {
  sections_done: number;
  sections_total: number;
} {
  const total =
    order.progress?.sections_total > 0 ? order.progress.sections_total : DEFAULT_SECTIONS_TOTAL;
  const done = Math.min(Math.max(order.progress?.sections_done ?? 0, 0), total);
  return { sections_done: done, sections_total: total };
}

export function progressSteps(
  order: Pick<OrderStatusOut, "status" | "progress">,
): { key: ProgressStep; state: StepState }[] {
  const current = currentIndex(order);
  return PROGRESS_STEPS.map((key, index) => ({
    key,
    state: index < current ? "done" : index === current ? "current" : "upcoming",
  }));
}

/**
 * Overall completion 0–100 for a progress bar: payment and chart are quick (10 % each), the six
 * chapters are most of the work (70 %), the PDF the rest.
 */
export function progressPercent(order: Pick<OrderStatusOut, "status" | "progress">): number {
  const { sections_done: done, sections_total: total } = sectionCounts(order);
  switch (order.status) {
    case "awaiting_payment":
    case "abandoned":
      return 0;
    case "paid":
      return 10;
    case "queued":
      return 15;
    case "generating":
    case "generation_failed":
      return Math.round(20 + (70 * done) / total);
    default:
      return 100;
  }
}
