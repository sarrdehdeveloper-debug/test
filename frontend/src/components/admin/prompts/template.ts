/**
 * Prompt template helpers (sandboxed Jinja2 on the backend: `{{ sun_sign }}`, `{% if name %}…`).
 * Pure functions, used by the template editor (highlighting, variable insertion) and tested.
 */

export type TemplateTokenKind = "text" | "variable" | "tag" | "comment";

export interface TemplateToken {
  kind: TemplateTokenKind;
  text: string;
  /** `{{ name|filter }}` → `name` (variables only). */
  name?: string;
  /** False when `name` is not one of the known variables (likely a typo). */
  known?: boolean;
}

const TOKEN_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g;
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
/** Jinja words that are not variables. */
const JINJA_WORDS = new Set([
  "if",
  "elif",
  "else",
  "endif",
  "for",
  "endfor",
  "in",
  "not",
  "and",
  "or",
  "is",
  "set",
  "true",
  "false",
  "none",
  "True",
  "False",
  "None",
  "loop",
  "defined",
  "undefined",
  "raw",
  "endraw",
  "with",
  "endwith",
]);

/**
 * Split one line (or any text) into plain text and Jinja tokens. Unterminated `{{` stays text, so
 * highlighting never breaks while the user is typing.
 */
export function tokenizeTemplate(
  source: string,
  known?: ReadonlySet<string> | null,
): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > last) tokens.push({ kind: "text", text: source.slice(last, start) });
    const text = match[0];
    if (text.startsWith("{{")) {
      const name = /^\{\{-?\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(text)?.[1];
      tokens.push({
        kind: "variable",
        text,
        name,
        known: !known || !name ? true : known.has(name) || JINJA_WORDS.has(name),
      });
    } else {
      tokens.push({ kind: text.startsWith("{#") ? "comment" : "tag", text });
    }
    last = start + text.length;
  }
  if (last < source.length) tokens.push({ kind: "text", text: source.slice(last) });
  return tokens;
}

/** Known variable names used anywhere in `{{ … }}` or `{% … %}` (for the variables panel). */
export function usedVariables(source: string, known: Iterable<string>): Set<string> {
  const names = new Set(known);
  const used = new Set<string>();
  for (const match of source.matchAll(TOKEN_RE)) {
    if (match[0].startsWith("{#")) continue;
    for (const ident of match[0].matchAll(IDENT_RE)) {
      if (names.has(ident[0])) used.add(ident[0]);
    }
  }
  return used;
}

/** `{{ name }}` names that are not known variables (shown as a warning before saving). */
export function unknownVariables(source: string, known: Iterable<string>): string[] {
  const names = new Set(known);
  const out = new Set<string>();
  for (const token of tokenizeTemplate(source, names)) {
    if (token.kind === "variable" && token.name && token.known === false) out.add(token.name);
  }
  return [...out];
}

/** The snippet inserted by the variables panel. */
export function variableSnippet(name: string): string {
  return `{{ ${name} }}`;
}

/**
 * Replace the selection `[start, end)` of `value` with `text`; returns the new value and the caret
 * position after the inserted text. Out-of-range positions are clamped (end of text by default).
 */
export function insertAtSelection(
  value: string,
  start: number | null | undefined,
  end: number | null | undefined,
  text: string,
): { value: string; caret: number } {
  const length = value.length;
  const from = clamp(start ?? length, 0, length);
  const to = clamp(end ?? from, from, length);
  return { value: value.slice(0, from) + text + value.slice(to), caret: from + text.length };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(n) ? n : max, min), max);
}

/** Words as the backend counts them roughly (whitespace separated), for preview statistics. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Lines as a <textarea> shows them (it normalises line breaks to "\n"). */
export function splitTemplateLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** Number of lines (an empty text has one line). */
export function countLines(text: string): number {
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) lines += 1;
  return lines;
}

/** Display an example value of a variable (`24.3`, `"Leo"`, `false`). */
export function formatExample(value: unknown): string {
  if (typeof value === "string") return value === "" ? '""' : value;
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
