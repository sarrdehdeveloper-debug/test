"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AdminButton } from "./AdminButton";
import { adminControlClasses, SelectInput } from "./form";
import { Icon } from "./icons";

export interface ToolbarProps {
  children: ReactNode;
  /** Content pushed to the end side (e.g. a "New" button or result count). */
  end?: ReactNode;
  className?: string;
}

/**
 * Row of filters/actions above a table; wraps on small screens.
 *   <Toolbar end={<AdminButton icon="refresh" onClick={refetch}>Refresh</AdminButton>}>
 *     <SearchInput value={q} onChange={setQ} placeholder="Search email or order id" />
 *     <FilterSelect label="Status" value={status} onChange={setStatus} options={…} />
 *   </Toolbar>
 */
export function Toolbar({ children, end, className }: ToolbarProps) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end gap-2 sm:gap-3", className)}>
      {children}
      {end ? <div className="ms-auto flex flex-wrap items-center gap-2">{end}</div> : null}
    </div>
  );
}

export interface FilterBarProps extends ToolbarProps {
  /** Shows "Clear filters" when true. */
  active?: boolean;
  onClear?: () => void;
}

/** Toolbar with a "Clear filters" button when any filter is set. */
export function FilterBar({ active = false, onClear, children, end, className }: FilterBarProps) {
  return (
    <Toolbar className={className} end={end}>
      {children}
      {active && onClear ? (
        <AdminButton variant="ghost" size="sm" icon="close" onClick={onClear} className="mb-1">
          Clear filters
        </AdminButton>
      ) : null}
    </Toolbar>
  );
}

export interface SearchInputProps {
  /** Committed value (e.g. from the URL). */
  value: string;
  /** Called with the new value after `debounce` ms of no typing, or on Enter. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible label (visually hidden). Default "Search". */
  label?: string;
  /** ms; 0 = only on Enter/blur. Default 350. */
  debounce?: number;
  className?: string;
}

/** Search box with a magnifier icon, debounced `onChange`, clear button and Enter to apply. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  debounce = 350,
  className,
}: SearchInputProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Follow external changes (e.g. "Clear filters") without an effect.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  useEffect(() => {
    if (!debounce || draft === value) return;
    const timer = window.setTimeout(() => onChange(draft.trim()), debounce);
    return () => window.clearTimeout(timer);
  }, [draft, value, debounce, onChange]);

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
      />
      <input
        id={id}
        type="search"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onChange(draft.trim());
          if (event.key === "Escape" && draft) {
            event.preventDefault();
            setDraft("");
            onChange("");
          }
        }}
        onBlur={() => {
          if (draft.trim() !== value) onChange(draft.trim());
        }}
        className={cn(
          adminControlClasses,
          "h-10 ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="absolute end-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-ink"
          aria-label="Clear search"
        >
          <Icon name="close" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  /** Label of the empty option (default "All"). Pass `null` for no empty option. */
  allLabel?: string | null;
  /** Show the label above the select (default: visually hidden). */
  showLabel?: boolean;
  className?: string;
}

/** Compact labelled <select> for toolbars. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  showLabel = false,
  className,
}: FilterSelectProps) {
  const id = useId();
  return (
    <div className={cn("flex w-full flex-col gap-1 sm:w-48", className)}>
      <label
        htmlFor={id}
        className={cn("text-xs font-medium text-ink-soft", !showLabel && "sr-only")}
      >
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel !== null ? <option value="">{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}
