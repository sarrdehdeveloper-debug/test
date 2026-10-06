"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FilterChipOption {
  value: string;
  label: ReactNode;
  /** Small count after the label. */
  count?: number;
  /** Tone of the count (e.g. warning for untranslated). */
  countTone?: "neutral" | "warning" | "gold";
}

export interface FilterChipsProps {
  /** Accessible name of the group. */
  label: string;
  options: FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const COUNT_TONE = {
  neutral: "bg-stone-100 text-stone-600",
  warning: "bg-warning-soft text-warning",
  gold: "bg-gold-pale text-gold-deep",
} as const;

/**
 * Single-choice pill row (scrolls horizontally on phones), e.g. section filters:
 *   <FilterChips label="Section" value={group} onChange={setGroup} options={[{ value: "", label: "All", count: 68 }, …]} />
 */
export function FilterChips({ label, options, value, onChange, className }: FilterChipsProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors",
              active
                ? "border-night bg-night text-ivory"
                : "border-stone-200 bg-white text-ink-soft hover:border-stone-300 hover:text-ink",
            )}
          >
            <span>{option.label}</span>
            {option.count !== undefined ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[0.7rem] leading-5 tabular-nums",
                  active
                    ? "bg-white/15 text-gold-light"
                    : COUNT_TONE[option.countTone ?? "neutral"],
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface ToggleChipProps {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: ReactNode;
  count?: number;
  className?: string;
}

/** On/off filter pill ("Untranslated only"). */
export function ToggleChip({ pressed, onChange, children, count, className }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors",
        pressed
          ? "border-gold bg-gold-pale/70 text-gold-deep"
          : "border-stone-200 bg-white text-ink-soft hover:border-stone-300 hover:text-ink",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-3.5 items-center justify-center rounded-[4px] border",
          pressed ? "border-gold-deep bg-gold-deep text-white" : "border-stone-300",
        )}
      >
        {pressed ? (
          <svg
            viewBox="0 0 12 12"
            className="size-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m2.5 6.5 2 2 5-5" />
          </svg>
        ) : null}
      </span>
      {children}
      {count !== undefined ? <span className="tabular-nums opacity-80">({count})</span> : null}
    </button>
  );
}
