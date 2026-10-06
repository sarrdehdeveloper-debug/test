"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  progressPercent,
  progressSteps,
  sectionCounts,
  type StepState,
} from "@/lib/flows/progress";
import type { OrderStatusOut } from "@/lib/types";

/** Vertical timeline: payment → chart → six chapters → PDF → ready, with an overall bar. */
export function ProgressTracker({
  order,
  className,
}: {
  order: OrderStatusOut;
  className?: string;
}) {
  const t = useTranslations("order.progress");
  const steps = progressSteps(order);
  const percent = progressPercent(order);
  const { sections_done: done, sections_total: total } = sectionCounts(order);

  return (
    <Card as="section" aria-labelledby="progress-steps-title" padding="lg" className={className}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="progress-steps-title" className="font-serif text-2xl font-semibold text-fg">
          {t("stepsTitle")}
        </h2>
        <span className="shrink-0 text-sm font-semibold text-accent tabular-nums">
          {t("percent", { percent })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-labelledby="progress-steps-title"
        className="mt-4 h-2 overflow-hidden rounded-full bg-parchment"
      >
        <div
          className="h-full rounded-full bg-gold-gradient transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>

      <ol className="mt-7 space-y-0">
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute start-[0.9375rem] top-9 bottom-1 w-px",
                  step.state === "done" ? "bg-gold/60" : "bg-line",
                )}
              />
            ) : null}
            <StepIcon state={step.state} />
            <div className="min-w-0 flex-1 pt-1">
              <p
                className={cn(
                  "font-medium",
                  step.state === "upcoming" ? "text-muted" : "text-fg",
                  step.state === "current" && "font-semibold",
                )}
              >
                {t(`steps.${step.key}`)}
              </p>
              {step.key === "writing" && step.state !== "upcoming" ? (
                <div className="mt-2">
                  <div aria-hidden="true" className="flex gap-1.5">
                    {Array.from({ length: total }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-colors duration-500",
                          i < done ? "bg-gold-bright" : "bg-parchment",
                          i === done &&
                            step.state === "current" &&
                            "animate-pulse bg-gold-light/60",
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-sm text-muted tabular-nums">
                    {t("chapters", { done, total })}
                  </p>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft-gradient text-night shadow-[0_4px_12px_-4px_rgb(199_137_51/0.7)]">
        <svg
          viewBox="0 0 20 20"
          className="size-4"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 10.5 3.5 3.5 7.5-8" />
        </svg>
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-gold-bright bg-white text-ink">
        <Spinner size="sm" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white"
    >
      <span className="size-1.5 rounded-full bg-line" />
    </span>
  );
}
