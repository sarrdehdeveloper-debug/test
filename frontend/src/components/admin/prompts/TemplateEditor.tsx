"use client";

import {
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";
import { useFieldControl } from "@/components/ui/form/Field";
import { cn } from "@/lib/cn";
import { insertAtSelection, splitTemplateLines, tokenizeTemplate } from "./template";

export interface TemplateEditorHandle {
  /** Insert text at the caret (replacing the selection), keeping the browser's undo history. */
  insert: (text: string) => void;
  focus: () => void;
}

export interface TemplateEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** Known variable names: other `{{ names }}` are underlined in red. */
  known?: ReadonlySet<string> | null;
  /** Minimum visible lines (the editor grows with its content up to `maxHeightClassName`). */
  minLines?: number;
  /** Tailwind max-height of the scroll area (default `max-h-[38rem]`). */
  maxHeightClassName?: string;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleRef?: Ref<TemplateEditorHandle>;
  className?: string;
}

/**
 * Monospace prompt editor: a real <textarea> (transparent text, visible caret) laid exactly over a
 * highlighted copy with line numbers. Both layers share font, padding, width and wrapping rules,
 * and the copy defines the height, so the textarea never scrolls on its own. Works inside <Field>.
 *
 *   <Field label="Template" error={errors.template}>
 *     <TemplateEditor value={form.template} onChange={…} known={variableNames} handleRef={editorRef} />
 *   </Field>
 */
export function TemplateEditor({
  value,
  onChange,
  readOnly = false,
  known,
  minLines = 8,
  maxHeightClassName = "max-h-[38rem]",
  placeholder,
  maxLength,
  onFocus,
  onKeyDown,
  handleRef,
  className,
  ...props
}: TemplateEditorProps) {
  const field = useFieldControl(props);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => textarea.current?.focus(),
      insert: (text: string) => {
        const element = textarea.current;
        if (!element || readOnly) return;
        element.focus();
        // execCommand keeps native undo (Ctrl+Z) and fires a regular input event.
        let inserted = false;
        try {
          inserted =
            typeof document.execCommand === "function" &&
            document.execCommand("insertText", false, text);
        } catch {
          inserted = false;
        }
        if (!inserted) {
          const next = insertAtSelection(
            element.value,
            element.selectionStart,
            element.selectionEnd,
            text,
          );
          onChange?.(next.value);
          requestAnimationFrame(() => element.setSelectionRange(next.caret, next.caret));
        }
      },
    }),
    [onChange, readOnly],
  );

  const lines = useMemo(() => splitTemplateLines(value), [value]);
  const digits = String(Math.max(lines.length, 99)).length;
  const style = { "--gutter": `calc(${digits}ch + 1.5rem)`, tabSize: 4 } as CSSProperties;
  const minHeight = `calc(${minLines} * 1.5rem + 1.25rem)`;

  // Shared by both layers: any difference here would misplace the caret.
  const layer =
    "m-0 border-0 py-2.5 ps-[var(--gutter)] pe-3 font-mono text-[0.8125rem] leading-6 tracking-normal whitespace-pre-wrap break-words [font-variant-ligatures:none] [word-break:normal]";

  return (
    <div
      style={style}
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-stone-300 shadow-xs transition-[border-color,box-shadow] duration-150",
        readOnly ? "bg-stone-50" : "bg-white hover:border-stone-400",
        "focus-within:border-gold-bright focus-within:ring-3 focus-within:ring-gold-light/40",
        field.invalid && "border-danger focus-within:ring-danger/20",
        className,
      )}
    >
      <div className={cn("overflow-y-auto overscroll-contain", maxHeightClassName)}>
        <div className="relative" style={{ minHeight }}>
          {/* Highlighted copy with line numbers (defines the height). */}
          <div
            aria-hidden="true"
            className={cn(layer, "pointer-events-none text-ink select-none forced-colors:hidden")}
          >
            {/* Gutter background. */}
            <span className="absolute inset-y-0 start-0 w-[var(--gutter)] border-e border-stone-200 bg-stone-50/80" />
            {lines.map((line, index) => (
              <div key={index} className="relative">
                <span className="absolute -start-[var(--gutter)] w-[calc(var(--gutter)-0.75rem)] text-end text-stone-400 tabular-nums">
                  {index + 1}
                </span>
                {line ? (
                  tokenizeTemplate(line, known).map((token, i) =>
                    token.kind === "text" ? (
                      <span key={i}>{token.text}</span>
                    ) : (
                      <span
                        key={i}
                        className={cn(
                          "rounded-[3px]",
                          token.kind === "variable" &&
                            (token.known === false
                              ? "bg-danger-soft text-danger underline decoration-danger decoration-wavy underline-offset-4"
                              : "bg-gold-pale/80 text-gold-deep"),
                          token.kind === "tag" && "bg-info-soft/80 text-info",
                          token.kind === "comment" && "text-stone-400",
                        )}
                      >
                        {token.text}
                      </span>
                    ),
                  )
                ) : (
                  // Keeps the height of an empty line (the textarea shows one too).
                  <span>{"​"}</span>
                )}
              </div>
            ))}
          </div>
          <textarea
            ref={textarea}
            id={field.id}
            aria-label={props["aria-label"]}
            aria-describedby={field["aria-describedby"]}
            aria-invalid={field["aria-invalid"]}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            readOnly={readOnly}
            placeholder={placeholder}
            maxLength={maxLength}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            dir="ltr"
            wrap="soft"
            className={cn(
              layer,
              "absolute inset-0 block size-full resize-none overflow-hidden bg-transparent text-transparent caret-ink outline-none",
              "placeholder:text-stone-400 selection:bg-gold-light/45 focus-visible:outline-none",
              "forced-colors:static forced-colors:text-[CanvasText]",
            )}
          />
        </div>
      </div>
    </div>
  );
}
