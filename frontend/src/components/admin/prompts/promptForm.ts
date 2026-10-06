import type { Locale, PromptDraftUpdate, PromptVersion } from "@/lib/admin/types";

/**
 * Draft editor form state ↔ API (`PATCH /prompts/versions/{id}`). Limits mirror
 * backend/app/prompts/schemas.py; the backend strips surrounding whitespace of every string.
 */

export const PROMPT_LIMITS = {
  name: 200,
  sectionTitle: 300,
  template: 20_000,
  systemInstruction: 10_000,
  notes: 5_000,
  minWordsMax: 5_000,
} as const;

export interface PromptForm {
  name: string;
  /** One entry per content locale (missing locales = ""). */
  section_titles: Record<Locale, string>;
  system_instruction: string;
  template: string;
  /** Raw input: "" = use the global `min_words` setting. */
  min_words: string;
  notes: string;
}

export type PromptFormField = "name" | "system_instruction" | "template" | "min_words" | "notes";
/** Field keys of errors: the form fields plus `section_titles.<locale>`. */
export type PromptFormErrors = Partial<
  Record<PromptFormField | `section_titles.${string}`, string>
>;

export function promptFormFromVersion(version: PromptVersion, locales: Locale[]): PromptForm {
  const titles: Record<Locale, string> = {};
  for (const locale of new Set([...locales, ...Object.keys(version.section_titles ?? {})])) {
    titles[locale] = version.section_titles?.[locale] ?? "";
  }
  return {
    name: version.name,
    section_titles: titles,
    system_instruction: version.system_instruction,
    template: version.template,
    min_words: version.min_words === null ? "" : String(version.min_words),
    notes: version.notes,
  };
}

/** "" → null (global setting); "350" → 350; anything else → undefined (invalid). */
export function parseMinWords(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return value <= PROMPT_LIMITS.minWordsMax ? value : undefined;
}

/** Client-side checks before saving (the server re-validates and also renders the template). */
export function validatePromptForm(form: PromptForm): PromptFormErrors {
  const errors: PromptFormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Enter a name for this version.";
  else if (name.length > PROMPT_LIMITS.name)
    errors.name = `Use at most ${PROMPT_LIMITS.name} characters.`;

  for (const [locale, title] of Object.entries(form.section_titles)) {
    if (title.trim().length > PROMPT_LIMITS.sectionTitle) {
      errors[`section_titles.${locale}`] = `Use at most ${PROMPT_LIMITS.sectionTitle} characters.`;
    }
  }

  const template = form.template.trim();
  if (!template) errors.template = "The template must not be empty.";
  else if (template.length > PROMPT_LIMITS.template)
    errors.template = `The template is too long (${template.length.toLocaleString("en-US")} of ${PROMPT_LIMITS.template.toLocaleString("en-US")} characters).`;

  if (form.system_instruction.trim().length > PROMPT_LIMITS.systemInstruction) {
    errors.system_instruction = `The system instruction is too long (maximum ${PROMPT_LIMITS.systemInstruction.toLocaleString("en-US")} characters).`;
  }
  if (parseMinWords(form.min_words) === undefined) {
    errors.min_words = `Enter a whole number from 0 to ${PROMPT_LIMITS.minWordsMax.toLocaleString("en-US")}, or leave it empty.`;
  }
  if (form.notes.trim().length > PROMPT_LIMITS.notes) {
    errors.notes = `Use at most ${PROMPT_LIMITS.notes.toLocaleString("en-US")} characters.`;
  }
  return errors;
}

/** `[locale, title]` pairs in content-locale order (then any other locale), for display. */
export function orderedTitles(
  titles: Record<Locale, string>,
  locales: Locale[] = ["en", "ar"],
): Array<[Locale, string]> {
  const rank = (locale: Locale) => {
    const index = locales.indexOf(locale);
    return index === -1 ? locales.length : index;
  };
  return Object.entries(titles).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Titles as the backend stores them: trimmed, empty ones dropped. */
export function normalizeTitles(titles: Record<Locale, string>): Record<Locale, string> {
  const out: Record<Locale, string> = {};
  for (const [locale, title] of Object.entries(titles)) {
    const value = title.trim();
    if (value) out[locale] = value;
  }
  return out;
}

function sameTitles(a: Record<Locale, string>, b: Record<Locale, string>): boolean {
  const left = normalizeTitles(a);
  const right = normalizeTitles(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (left[key] !== right[key]) return false;
  return true;
}

/**
 * The PATCH body: only fields that differ from `version` (compared as the backend stores them).
 * An invalid `min_words` is left out (validation reports it).
 */
export function promptFormChanges(form: PromptForm, version: PromptVersion): PromptDraftUpdate {
  const changes: PromptDraftUpdate = {};
  if (form.name.trim() !== version.name.trim()) changes.name = form.name.trim();
  if (!sameTitles(form.section_titles, version.section_titles ?? {})) {
    changes.section_titles = normalizeTitles(form.section_titles);
  }
  if (form.system_instruction.trim() !== version.system_instruction.trim()) {
    changes.system_instruction = form.system_instruction.trim();
  }
  if (form.template.trim() !== version.template.trim()) changes.template = form.template.trim();
  const minWords = parseMinWords(form.min_words);
  if (minWords !== undefined && minWords !== version.min_words) changes.min_words = minWords;
  if (form.notes.trim() !== version.notes.trim()) changes.notes = form.notes.trim();
  return changes;
}

export function isPromptFormDirty(form: PromptForm, version: PromptVersion): boolean {
  return (
    Object.keys(promptFormChanges(form, version)).length > 0 ||
    parseMinWords(form.min_words) === undefined
  );
}

/** Human list of changed fields: "template and notes". */
export function describeChanges(changes: PromptDraftUpdate): string {
  const labels: Record<keyof PromptDraftUpdate, string> = {
    name: "name",
    section_titles: "section titles",
    system_instruction: "system instruction",
    template: "template",
    min_words: "minimum words",
    notes: "notes",
  };
  const names = (Object.keys(changes) as Array<keyof PromptDraftUpdate>).map((k) => labels[k]);
  if (names.length <= 1) return names[0] ?? "nothing";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Map an API error onto form fields: `invalid_template` carries `details.field`
 * (`template` / `system_instruction`), 422 `validation_error` carries `details.fields`.
 */
export function promptFieldErrors(
  error: { code: string; message: string; details: Record<string, unknown> } | null,
  fieldErrors: Record<string, string> = {},
): PromptFormErrors {
  if (!error) return {};
  const out: PromptFormErrors = {};
  if (error.code === "invalid_template") {
    const field = error.details.field === "system_instruction" ? "system_instruction" : "template";
    out[field] = error.message;
  }
  if (error.code === "template_required") out.template = "The template must not be empty.";
  for (const [field, message] of Object.entries(fieldErrors)) {
    const key = field.replace(/^body\./, "");
    if (key === "section_titles") out["section_titles.en"] ??= message;
    else if (
      ["name", "system_instruction", "template", "min_words", "notes"].includes(key) ||
      key.startsWith("section_titles.")
    ) {
      out[key as PromptFormField] = message;
    }
  }
  return out;
}
