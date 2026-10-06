"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  /** Small count after the label (hidden when undefined). */
  count?: number | null;
  /** Highlight the count (e.g. failed jobs > 0). */
  countTone?: "neutral" | "danger" | "warning";
  disabled?: boolean;
}

export interface TabsProps<V extends string> {
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix for the tab / panel ids (`<idBase>-tab-<value>`, `<idBase>-panel`). */
  idBase: string;
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  /** `underline` (page sections) or `pills` (filters inside a panel). */
  variant?: "underline" | "pills";
  /**
   * One panel per tab (`<idBase>-panel-<value>`, e.g. panels kept mounted and hidden) instead of a
   * single panel whose content changes.
   */
  panelPerTab?: boolean;
  className?: string;
}

function panelId(idBase: string, value: string, perTab: boolean): string {
  return perTab ? `${idBase}-panel-${value}` : `${idBase}-panel`;
}

/**
 * Props for the panel controlled by <Tabs>: `<div {...tabPanelProps("jobs", status)}>`; with
 * `panelPerTab`, one per tab: `<div {...tabPanelProps("prompt", "draft", true)} hidden={tab !== "draft"}>`.
 */
export function tabPanelProps(idBase: string, value: string, perTab = false) {
  return {
    role: "tabpanel" as const,
    id: panelId(idBase, value, perTab),
    "aria-labelledby": `${idBase}-tab-${value}`,
    tabIndex: -1,
  };
}

/**
 * WAI-ARIA tab list (roving tabindex, ←/→/Home/End, automatic activation). Render the content in
 * one element with `tabPanelProps(idBase, value)`.
 */
export function Tabs<V extends string>({
  label,
  idBase,
  items,
  value,
  onChange,
  variant = "underline",
  panelPerTab = false,
  className,
}: TabsProps<V>) {
  const refs = useRef(new Map<V, HTMLButtonElement>());
  const enabled = items.filter((item) => !item.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = enabled.findIndex((item) => item.value === value);
    let next: TabItem<V> | undefined;
    // The dashboard UI is always LTR, so ArrowRight moves forward.
    if (event.key === "ArrowRight") next = enabled[(index + 1) % enabled.length];
    else if (event.key === "ArrowLeft")
      next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex max-w-full overflow-x-auto",
        variant === "underline"
          ? "gap-1 border-b border-stone-200"
          : "w-fit gap-1 rounded-lg border border-stone-200 bg-stone-100/70 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              if (node) refs.current.set(item.value, node);
              else refs.current.delete(item.value);
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={panelId(idBase, item.value, panelPerTab)}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              variant === "underline"
                ? cn(
                    "-mb-px border-b-2 px-3 py-2.5",
                    selected
                      ? "border-gold-bright text-ink"
                      : "border-transparent text-ink-soft hover:border-stone-300 hover:text-ink",
                  )
                : cn(
                    "h-8 justify-center rounded-md px-3",
                    selected
                      ? "bg-white text-ink shadow-sm ring-1 ring-stone-200"
                      : "text-ink-soft hover:bg-white/60 hover:text-ink",
                  ),
            )}
          >
            {item.label}
            {item.count !== undefined && item.count !== null ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[0.7rem] leading-5 font-semibold tabular-nums",
                  item.countTone === "danger" && item.count > 0
                    ? "bg-danger text-white"
                    : item.countTone === "warning" && item.count > 0
                      ? "bg-warning-soft text-warning"
                      : "bg-stone-200/80 text-ink-soft",
                )}
              >
                {item.count > 999 ? "999+" : item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
