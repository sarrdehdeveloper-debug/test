"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { controlClasses, useFieldControl } from "./Field";

type Status = "idle" | "loading" | "ready" | "error";

export interface ComboboxProps<T> {
  /** Selected item (controlled). */
  value: T | null;
  onChange: (item: T | null) => void;
  /** Async search. Called with "" when the list is opened empty. Honour `signal` for aborts. */
  loadOptions: (query: string, signal: AbortSignal) => Promise<T[]>;
  getOptionKey: (item: T) => string | number;
  getOptionLabel: (item: T) => string;
  /** Custom option content (defaults to the label). */
  renderOption?: (item: T, state: { active: boolean; selected: boolean }) => ReactNode;
  placeholder?: string;
  /** Name of a hidden input carrying the selected key (for <form> posts). */
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  /** Debounce before searching while typing (ms). */
  debounceMs?: number;
  /** Do not search below this many characters (the empty query still loads on open). */
  minQueryLength?: number;
  autoFocus?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  onBlur?: () => void;
}

/**
 * Accessible async combobox (WAI-ARIA 1.2 "list autocomplete with manual selection").
 * Keyboard: ↓/↑ move (opening the list), Enter selects, Escape closes then clears.
 *
 * City search example — remount with `key` when the dependency (country) changes:
 *   <Field label={t("labels.birthCity")} error={errors.city} required>
 *     <Combobox<City>
 *       key={country}
 *       value={city}
 *       onChange={setCity}
 *       loadOptions={(q, signal) =>
 *         api.get<ItemsResponse<City>>("/geo/cities", { query: { country, q, limit: 20 }, locale, signal })
 *           .then((r) => r.items)}
 *       getOptionKey={(c) => c.id}
 *       getOptionLabel={(c) => c.label}
 *       placeholder={t("placeholders.city")}
 *     />
 *   </Field>
 */
export function Combobox<T>({
  value,
  onChange,
  loadOptions,
  getOptionKey,
  getOptionLabel,
  renderOption,
  placeholder,
  name,
  id,
  disabled = false,
  required,
  debounceMs = 250,
  minQueryLength = 0,
  autoFocus,
  className,
  onBlur,
  ...aria
}: ComboboxProps<T>) {
  const t = useTranslations("form.combobox");
  const auto = useId();
  const field = useFieldControl({ id, required, ...aria });
  const baseId = field.id ?? `cb${auto.replace(/:/g, "")}`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const selectedKey = value === null ? null : getOptionKey(value);
  const selectedLabel = value === null ? "" : getOptionLabel(value);

  const [inputValue, setInputValue] = useState(selectedLabel);
  const [syncedKey, setSyncedKey] = useState(selectedKey);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");

  // Keep the text in sync when the parent changes `value` (e.g. pre-selecting a capital city).
  if (selectedKey !== syncedKey) {
    setSyncedKey(selectedKey);
    setInputValue(selectedLabel);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedQueryRef = useRef<string | null>(null);

  const load = useCallback(
    (query: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      loadedQueryRef.current = query;
      setStatus("loading");
      loadOptions(query, controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return;
          setOptions(items);
          setActiveIndex(items.length > 0 ? 0 : -1);
          setStatus("ready");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setOptions([]);
          setActiveIndex(-1);
          setStatus("error");
        });
    },
    [loadOptions],
  );

  const scheduleLoad = useCallback(
    (query: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const trimmed = query.trim();
      if (trimmed.length > 0 && trimmed.length < minQueryLength) return;
      timerRef.current = setTimeout(() => load(trimmed), trimmed ? debounceMs : 0);
    },
    [debounceMs, load, minQueryLength],
  );

  // Cancel pending work on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  // Keep the active option visible while navigating with the keyboard.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    const query = value !== null && inputValue === selectedLabel ? "" : inputValue.trim();
    if (loadedQueryRef.current !== query || status === "error") scheduleLoad(query);
  };

  const select = (item: T) => {
    onChange(item);
    setSyncedKey(getOptionKey(item));
    setInputValue(getOptionLabel(item));
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setInputValue("");
    scheduleLoad("");
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else if (options.length) setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else if (options.length)
          setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
        break;
      case "Enter":
        if (open && activeIndex >= 0 && options[activeIndex] !== undefined) {
          event.preventDefault();
          select(options[activeIndex]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
          if (value !== null) setInputValue(selectedLabel);
        } else if (inputValue) {
          event.preventDefault();
          clear();
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const showList = open && !disabled;
  const announcement = !showList
    ? ""
    : status === "loading"
      ? t("loading")
      : status === "error"
        ? t("error")
        : status === "ready"
          ? t("results", { count: options.length })
          : "";

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={baseId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={field["aria-describedby"]}
          aria-invalid={field["aria-invalid"]}
          aria-required={field.required || undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          className={cn(controlClasses, "pe-20")}
          onChange={(event) => {
            const next = event.target.value;
            setInputValue(next);
            setOpen(true);
            if (value !== null) onChange(null);
            scheduleLoad(next);
          }}
          onClick={() => {
            if (!open) openList();
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            if (value !== null) setInputValue(selectedLabel);
            onBlur?.();
          }}
        />
        <div className="absolute inset-y-0 end-3 flex items-center gap-1 text-gold">
          {status === "loading" && showList ? <Spinner size="sm" /> : null}
          {inputValue && !disabled ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("clear")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={clear}
              className="grid size-7 place-items-center rounded-full text-ink-soft hover:bg-parchment hover:text-ink"
            >
              <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          ) : null}
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={cn("size-4 transition-transform", showList && "rotate-180")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </div>
      </div>

      {name ? <input type="hidden" name={name} value={selectedKey ?? ""} /> : null}

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        hidden={!showList}
        className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-gold/30 bg-white py-1.5 text-ink shadow-lift"
      >
        {options.map((item, index) => {
          const key = getOptionKey(item);
          const active = index === activeIndex;
          const selected = key === selectedKey;
          return (
            <li
              key={key}
              id={optionId(index)}
              data-index={index}
              role="option"
              aria-selected={selected}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => {
                if (!active) setActiveIndex(index);
              }}
              onClick={() => select(item)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-[0.95rem]",
                active && "bg-gold-pale/70",
              )}
            >
              <span className="min-w-0 truncate">
                {renderOption ? renderOption(item, { active, selected }) : getOptionLabel(item)}
              </span>
              {selected ? (
                <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-gold-deep" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                </svg>
              ) : null}
            </li>
          );
        })}
        {status === "ready" && options.length === 0 ? (
          <li role="presentation" className="px-4 py-3 text-sm text-ink-soft">
            {t("noResults")}
          </li>
        ) : null}
        {status === "error" ? (
          <li role="presentation" className="px-4 py-3 text-sm text-danger">
            {t("error")}
          </li>
        ) : null}
        {status === "loading" && options.length === 0 ? (
          <li role="presentation" className="flex items-center gap-2 px-4 py-3 text-sm text-ink-soft">
            <Spinner size="sm" /> {t("loading")}
          </li>
        ) : null}
      </ul>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
