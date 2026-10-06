"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFieldControl } from "@/components/ui/form/Field";
import { Spinner } from "@/components/ui/Spinner";
import { adminApi, isAbortError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { useDebouncedValue } from "@/lib/admin/hooks";
import {
  countWords,
  insertLink,
  toggleInline,
  toggleLinePrefix,
  type TextEdit,
} from "@/lib/admin/markdown";
import type { HtmlOut } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { adminControlClasses } from "./form";
import { Icon, type IconName } from "./icons";

export type MarkdownView = "write" | "split" | "preview";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Control id (set automatically inside <Field>). */
  id?: string;
  /** `lang="ar" dir="rtl"` for Arabic content (TranslationTabs' `fieldProps` sets both). */
  lang?: string;
  dir?: "ltr" | "rtl";
  /** Textarea height in rows (default 12). */
  rows?: number;
  placeholder?: string;
  /** Character limit (backend: 20 000 for most fields, 100 000 for blog bodies). */
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  /** Initial view (default "split": side by side from lg up, stacked on smaller screens). */
  defaultView?: MarkdownView;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

interface ToolbarAction {
  id: string;
  label: string;
  icon: IconName;
  shortcut?: string;
  apply: (text: string, start: number, end: number) => TextEdit;
}

const ACTIONS: ToolbarAction[] = [
  {
    id: "bold",
    label: "Bold",
    icon: "bold",
    shortcut: "B",
    apply: (t, s, e) => toggleInline(t, s, e, "**", "bold text"),
  },
  {
    id: "italic",
    label: "Italic",
    icon: "italic",
    shortcut: "I",
    apply: (t, s, e) => toggleInline(t, s, e, "_", "italic text"),
  },
  {
    id: "heading",
    label: "Heading",
    icon: "heading",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "## "),
  },
  {
    id: "list",
    label: "Bulleted list",
    icon: "list",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "- "),
  },
  {
    id: "ordered",
    label: "Numbered list",
    icon: "listOrdered",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "1. "),
  },
  {
    id: "quote",
    label: "Quote",
    icon: "quote",
    apply: (t, s, e) => toggleLinePrefix(t, s, e, "> "),
  },
  {
    id: "link",
    label: "Link",
    icon: "link",
    shortcut: "K",
    apply: (t, s, e) => insertLink(t, s, e),
  },
];

const VIEWS: Array<{ id: MarkdownView; label: string }> = [
  { id: "write", label: "Write" },
  { id: "split", label: "Split" },
  { id: "preview", label: "Preview" },
];

/** Replace `previous` by `next` through the browser's editing commands (keeps native undo). */
function replaceViaInput(textarea: HTMLTextAreaElement, previous: string, next: string): boolean {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start])
    start += 1;
  let endPrev = previous.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && previous[endPrev - 1] === next[endNext - 1]) {
    endPrev -= 1;
    endNext -= 1;
  }
  textarea.focus();
  textarea.setSelectionRange(start, endPrev);
  try {
    // Deprecated but the only way to keep the textarea's undo stack; fall back when unsupported.
    return (
      document.execCommand("insertText", false, next.slice(start, endNext)) &&
      textarea.value === next
    );
  } catch {
    return false;
  }
}

/**
 * Markdown textarea with a formatting toolbar (bold, italic, heading, lists, quote, link; Ctrl/⌘ +
 * B / I / K) and a live preview rendered by the API (`POST /admin/markdown/preview`, debounced,
 * sanitised HTML) — identical to what the public site shows. Arabic: pass `lang="ar" dir="rtl"`.
 *   <Field label="Body"><MarkdownEditor value={body} onChange={setBody} {...fieldProps} /></Field>
 */
export function MarkdownEditor({
  value,
  onChange,
  lang,
  dir = "ltr",
  rows = 12,
  placeholder,
  maxLength,
  disabled,
  defaultView = "split",
  className,
  ...props
}: MarkdownEditorProps) {
  const { invalid: _invalid, ...field } = useFieldControl(props);
  void _invalid;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [view, setView] = useState<MarkdownView>(defaultView);
  const showEditor = view !== "preview";
  const showPreview = view !== "write";

  /* ---------------- preview */
  const debounced = useDebouncedValue(value, 450);
  const [preview, setPreview] = useState<{
    source: string;
    html: string;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!showPreview || !debounced.trim()) return;
    const controller = new AbortController();
    adminApi
      .post<HtmlOut>("/markdown/preview", { markdown: debounced }, { signal: controller.signal })
      .then(
        (result) => setPreview({ source: debounced, html: result.html, error: null }),
        (err: unknown) => {
          if (isAbortError(err)) return;
          setPreview((prev) => ({
            source: debounced,
            html: prev?.html ?? "",
            error: adminErrorMessage(err),
          }));
        },
      );
    return () => controller.abort();
  }, [debounced, showPreview]);

  const empty = !value.trim();
  const updating = showPreview && !empty && preview?.source !== value;

  /* ---------------- toolbar */
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const textarea = textareaRef.current;
    if (!selection || !textarea) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(selection[0], selection[1]);
  }, [value]);

  const run = (action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    if (view === "preview") setView("split");
    const edit = action.apply(value, textarea.selectionStart, textarea.selectionEnd);
    if (edit.text === value) return;
    if (replaceViaInput(textarea, value, edit.text)) {
      // The input event already called onChange; just restore the intended selection.
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
      return;
    }
    pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
    onChange(edit.text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const action = ACTIONS.find(
      (a) => a.shortcut && a.shortcut.toLowerCase() === event.key.toLowerCase(),
    );
    if (!action) return;
    event.preventDefault();
    run(action);
  };

  const words = countWords(value);

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-stone-300 bg-white shadow-xs focus-within:border-gold-bright focus-within:ring-3 focus-within:ring-gold-light/40",
        props["aria-invalid"] && "border-danger",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50/80 px-1.5 py-1">
        <div role="group" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()} // keep the textarea selection
              onClick={() => run(action)}
              disabled={disabled || view === "preview"}
              title={action.shortcut ? `${action.label} (Ctrl/⌘ ${action.shortcut})` : action.label}
              aria-label={action.label}
              className="flex size-8 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-stone-200/70 hover:text-ink disabled:opacity-40"
            >
              <Icon name={action.icon} className="size-4" />
            </button>
          ))}
        </div>
        <div role="group" aria-label="View" className="flex rounded-md bg-stone-200/60 p-0.5">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === option.id ? "bg-white text-ink shadow-xs" : "text-ink-soft hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("grid", view === "split" && "lg:grid-cols-2")}>
        {showEditor ? (
          <textarea
            ref={textareaRef}
            {...field}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={rows}
            lang={lang}
            dir={dir}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            spellCheck
            className={cn(
              adminControlClasses,
              "min-h-40 resize-y rounded-none border-0 py-3 font-mono text-[0.8125rem] leading-relaxed shadow-none hover:border-0 focus:ring-0",
              lang === "ar" && "font-sans text-base",
              view === "split" &&
                "max-lg:border-b max-lg:border-stone-200 lg:border-e lg:border-stone-200",
            )}
          />
        ) : null}
        {showPreview ? (
          <div role="region" aria-label="Preview" className="relative min-w-0 bg-ivory/40">
            <div className="absolute end-2 top-2 z-10" aria-live="polite">
              {updating ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[0.7rem] text-ink-soft shadow-xs ring-1 ring-stone-200">
                  <Spinner size="sm" className="size-3" />
                  Updating preview…
                </span>
              ) : null}
            </div>
            {preview?.error && preview.source === debounced ? (
              <p
                role="alert"
                className="m-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger"
              >
                Preview failed: {preview.error}
              </p>
            ) : null}
            {empty ? (
              <p className="px-4 py-3 text-sm text-stone-400 italic">Nothing to preview yet.</p>
            ) : (
              <div
                lang={lang}
                dir={dir}
                className={cn(
                  "prose-zb max-h-[32rem] overflow-y-auto px-4 py-3 text-[0.95rem] transition-opacity [&>:first-child]:mt-0",
                  updating && "opacity-70",
                )}
                style={{ minHeight: `${Math.max(rows, 6) * 1.5}rem` }}
                dangerouslySetInnerHTML={{ __html: preview?.html ?? "" }}
              />
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/60 px-3 py-1 text-[0.7rem] text-ink-soft">
        <span>
          Markdown · <span className="tabular-nums">{words}</span> {words === 1 ? "word" : "words"}
        </span>
        {maxLength ? (
          <span className={cn("tabular-nums", value.length > maxLength * 0.9 && "text-warning")}>
            {value.length.toLocaleString("en-US")} / {maxLength.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
