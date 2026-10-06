"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { AmbiguousTimeOption } from "@/lib/types";

export type TimeProblem =
  | { kind: "ambiguous"; time: string; options: AmbiguousTimeOption[] }
  | { kind: "nonexistent"; time: string; suggested: string | null };

const ClockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="size-6 shrink-0 text-warning"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/**
 * Daylight-saving problems with the birth time, returned by POST /orders:
 * - ambiguous (clocks went back): choose the first or second occurrence -> resend with time_fold;
 * - nonexistent (clocks went forward): explain the gap and offer the API's suggested time.
 * The panel receives focus when it appears.
 */
export function TimeResolution({
  problem,
  busy,
  onChooseFold,
  onUseTime,
}: {
  problem: TimeProblem;
  busy: boolean;
  onChooseFold: (fold: 0 | 1) => void;
  onUseTime: (time: string) => void;
}) {
  const t = useTranslations("reading");
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [fold, setFold] = useState<0 | 1 | null>(null);
  const [missingChoice, setMissingChoice] = useState(false);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [problem]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby={titleId}
      className="rounded-2xl border border-warning/30 bg-warning-soft/70 p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/40 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <ClockIcon />
        <div className="min-w-0 flex-1">
          {problem.kind === "ambiguous" ? (
            <>
              <h4 id={titleId} className="font-serif text-xl font-semibold text-ink">
                {t("timeChoice.title", { time: problem.time })}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {t("timeChoice.body", { time: problem.time })}
              </p>
              <div className="mt-4 space-y-2.5" role="radiogroup" aria-labelledby={titleId}>
                {problem.options.map((option) => {
                  const checked = fold === option.fold;
                  return (
                    <label
                      key={option.fold}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-4 py-3 transition-colors",
                        checked
                          ? "border-gold-bright ring-2 ring-gold-light/50"
                          : "border-gold/30 hover:border-gold/60",
                      )}
                    >
                      <input
                        type="radio"
                        name="time_fold"
                        value={option.fold}
                        checked={checked}
                        onChange={() => {
                          setFold(option.fold);
                          setMissingChoice(false);
                        }}
                        className="mt-1 size-4 shrink-0 accent-gold-bright"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">
                          {t(option.fold === 0 ? "timeChoice.first" : "timeChoice.second", {
                            time: problem.time,
                          })}
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-soft tabular-nums" dir="ltr">
                          {option.label}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {missingChoice ? (
                <div className="mt-3">
                  <FieldError>{t("timeChoice.required")}</FieldError>
                </div>
              ) : null}
              <Button
                className="mt-5 max-sm:w-full"
                loading={busy}
                onClick={() => {
                  if (fold === null) setMissingChoice(true);
                  else onChooseFold(fold);
                }}
              >
                {t("timeChoice.confirm")}
              </Button>
            </>
          ) : (
            <>
              <h4 id={titleId} className="font-serif text-xl font-semibold text-ink">
                {t("gap.title", { time: problem.time })}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {t("gap.body", { time: problem.time })}
              </p>
              {problem.suggested ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {t("gap.suggestion", { suggested: problem.suggested })}
                  </p>
                  <Button
                    className="mt-4 max-sm:w-full"
                    loading={busy}
                    onClick={() => onUseTime(problem.suggested!)}
                  >
                    {t("gap.use", { suggested: problem.suggested })}
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
