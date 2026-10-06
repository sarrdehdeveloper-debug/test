"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, TextArea, TextInput } from "@/components/admin/form";
import { Icon } from "@/components/admin/icons";
import { Panel } from "@/components/admin/Panel";
import { adminApi, toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { formatDateTime, formatNumber } from "@/lib/admin/format";
import { useAdminMutation } from "@/lib/admin/hooks";
import type { Locale, PromptDraftUpdate, PromptVariable, PromptVersion } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import {
  describeChanges,
  isPromptFormDirty,
  parseMinWords,
  PROMPT_LIMITS,
  promptFieldErrors,
  promptFormChanges,
  promptFormFromVersion,
  validatePromptForm,
  type PromptForm,
  type PromptFormErrors,
} from "./promptForm";
import { countLines, unknownVariables, usedVariables, variableSnippet } from "./template";
import { TemplateEditor, type TemplateEditorHandle } from "./TemplateEditor";
import { TryPanel } from "./TryPanel";
import { VariablesPanel } from "./VariablesPanel";
import { VersionChanges, type PromptSnapshot } from "./VersionChanges";

const LOCALE_NAMES: Record<string, string> = { en: "English", ar: "Arabic" };

/** Thrown by `save()` when client-side validation fails (fields are highlighted). */
export class PromptFormInvalidError extends Error {
  constructor() {
    super("Some fields need attention. Fix the highlighted fields first.");
    this.name = "PromptFormInvalidError";
  }
}

/** Message for anything `save()` rejects with. */
export function draftSaveErrorMessage(err: unknown): string {
  if (err instanceof PromptFormInvalidError) return err.message;
  const error = toAdminApiError(err);
  if (error.code === "invalid_template") {
    const where = error.details.field === "system_instruction" ? "system instruction" : "template";
    return `The ${where} does not render: ${error.message}`;
  }
  return adminErrorMessage(error);
}

export interface DraftFormState {
  form: PromptForm | null;
  setField: <K extends keyof PromptForm>(key: K, value: PromptForm[K]) => void;
  setTitle: (locale: Locale, value: string) => void;
  dirty: boolean;
  changes: PromptDraftUpdate;
  errors: PromptFormErrors;
  saving: boolean;
  /** Validate and PATCH the changes; resolves with the saved draft (rejects on failure). */
  save: () => Promise<PromptVersion | null>;
  /** Throw away unsaved edits. */
  reset: () => void;
}

/**
 * Editor state of a slot's draft. Lives in the page (not the editor) so the header's Publish
 * button can save first and tab switches keep the edits.
 */
export function useDraftForm(
  draft: PromptVersion | null,
  locales: Locale[],
  onSaved: (version: PromptVersion) => void,
): DraftFormState {
  const [state, setState] = useState<{ key: number | null; form: PromptForm | null }>(() => ({
    key: draft?.id ?? null,
    form: draft ? promptFormFromVersion(draft, locales) : null,
  }));
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<PromptFormErrors>({});

  // A different draft (created, discarded, published): start from its saved text.
  const key = draft?.id ?? null;
  if (state.key !== key) {
    setState({ key, form: draft ? promptFormFromVersion(draft, locales) : null });
    setShowErrors(false);
    setServerErrors({});
  }

  const form =
    state.key === key ? state.form : draft ? promptFormFromVersion(draft, locales) : null;
  const dirty = form && draft ? isPromptFormDirty(form, draft) : false;
  const changes = useMemo(
    () => (form && draft ? promptFormChanges(form, draft) : {}),
    [form, draft],
  );
  const clientErrors = useMemo(() => (form ? validatePromptForm(form) : {}), [form]);
  const errors = { ...serverErrors, ...(showErrors ? clientErrors : {}) };

  const mutation = useAdminMutation(
    (body: PromptDraftUpdate) =>
      adminApi.patch<PromptVersion>(`/prompts/versions/${draft?.id}`, body),
    {
      successMessage: "Draft saved",
      // Field problems are shown next to the field; only other failures need a toast.
      errorMessage: (error) =>
        Object.keys(promptFieldErrors(error, error.fields)).length
          ? null
          : `Couldn't save the draft: ${draftSaveErrorMessage(error)}`,
      onSuccess: (saved) => {
        setState({ key: saved.id, form: promptFormFromVersion(saved, locales) });
        setShowErrors(false);
        setServerErrors({});
        onSaved(saved);
      },
      onError: (error) => setServerErrors(promptFieldErrors(error, error.fields)),
    },
  );

  const editField = (field: string) =>
    setServerErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field as keyof PromptFormErrors];
      return next;
    });

  return {
    form,
    dirty,
    changes,
    errors,
    saving: mutation.pending,
    setField: (field, value) => {
      editField(field);
      setState((prev) => (prev.form ? { ...prev, form: { ...prev.form, [field]: value } } : prev));
    },
    setTitle: (locale, value) => {
      editField(`section_titles.${locale}`);
      setState((prev) =>
        prev.form
          ? {
              ...prev,
              form: {
                ...prev.form,
                section_titles: { ...prev.form.section_titles, [locale]: value },
              },
            }
          : prev,
      );
    },
    save: async () => {
      if (!form || !draft) return null;
      if (Object.keys(clientErrors).length) {
        setShowErrors(true);
        throw new PromptFormInvalidError();
      }
      if (!Object.keys(changes).length) return draft;
      return mutation.mutateAsync(changes);
    },
    reset: () => {
      setState({ key, form: draft ? promptFormFromVersion(draft, locales) : null });
      setShowErrors(false);
      setServerErrors({});
    },
  };
}

/* ================================================================== editor UI */

function InsertVariableSelect({
  variables,
  onInsert,
}: {
  variables: PromptVariable[] | undefined;
  onInsert: (name: string) => void;
}) {
  if (!variables?.length) return null;
  return (
    <label className="relative xl:hidden">
      <span className="sr-only">Insert a variable at the cursor</span>
      <select
        value=""
        onChange={(event) => {
          if (event.target.value) onInsert(event.target.value);
        }}
        className="h-8 max-w-44 appearance-none rounded-md border border-stone-300 bg-white ps-2.5 pe-7 text-xs font-medium text-ink hover:border-stone-400 focus:border-gold-bright focus:ring-3 focus:ring-gold-light/40 focus:outline-none"
      >
        <option value="">Insert variable…</option>
        {variables.map((v) => (
          <option key={v.name} value={v.name}>
            {variableSnippet(v.name)}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-stone-500"
      />
    </label>
  );
}

function EditorMeta({
  value,
  max,
  known,
}: {
  value: string;
  max: number;
  known: ReadonlySet<string> | null;
}) {
  const unknown = known ? unknownVariables(value, known) : [];
  const length = value.trim().length;
  return (
    <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-xs">
      <p className={cn("tabular-nums", length > max ? "font-medium text-danger" : "text-ink-soft")}>
        {formatNumber(length)} / {formatNumber(max)} characters · {formatNumber(countLines(value))}{" "}
        lines
      </p>
      {unknown.length ? (
        <p className="flex items-center gap-1 font-medium text-danger" role="status">
          <Icon name="alert" className="size-3.5" />
          Unknown {unknown.length === 1 ? "variable" : "variables"}:{" "}
          <code className="font-mono">{unknown.join(", ")}</code>
        </p>
      ) : null}
    </div>
  );
}

function SaveBar({ state, onDiscard }: { state: DraftFormState; onDiscard: () => void }) {
  if (!state.dirty && !state.saving) return null;
  return (
    <div className="pointer-events-none sticky bottom-4 z-20 mt-6 flex">
      <div
        role="region"
        aria-label="Unsaved changes"
        className="pointer-events-auto flex w-full max-w-xl animate-[admin-rise_0.2s_ease-out_both] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-night px-4 py-3 text-ivory shadow-lift ring-1 ring-gold/25"
      >
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium text-gold-light">Unsaved changes</span>
          {Object.keys(state.changes).length ? (
            <span className="text-mist"> to the {describeChanges(state.changes)}</span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <AdminButton
            size="sm"
            variant="ghost"
            onClick={onDiscard}
            disabled={state.saving}
            className="text-mist hover:bg-white/10 hover:text-ivory"
          >
            Discard
          </AdminButton>
          <AdminButton
            size="sm"
            variant="gold"
            loading={state.saving}
            onClick={() => void state.save().catch(() => undefined)}
            title="Save (Ctrl+S / ⌘S)"
          >
            Save draft
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

export interface DraftEditorProps {
  draft: PromptVersion;
  published: PromptVersion | null;
  state: DraftFormState;
  locales: Locale[];
  variables: PromptVariable[] | undefined;
  variablesLoading?: boolean;
  variablesError?: unknown;
  onRetryVariables?: () => void;
  /** Global `min_words` setting (for the hint), when known. */
  globalMinWords: number | null;
  /** Extra content above the editor (e.g. alerts). */
  children?: ReactNode;
}

type Target = "template" | "system_instruction";

/** The draft form: details, system instruction, template, notes, changes, preview/test, variables. */
export function DraftEditor({
  draft,
  published,
  state,
  locales,
  variables,
  variablesLoading,
  variablesError,
  onRetryVariables,
  globalMinWords,
  children,
}: DraftEditorProps) {
  const templateRef = useRef<TemplateEditorHandle>(null);
  const systemRef = useRef<TemplateEditorHandle>(null);
  const [target, setTarget] = useState<Target>("template");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const { form, errors } = state;
  const known = useMemo(
    () => (variables ? new Set(variables.map((v) => v.name)) : null),
    [variables],
  );
  const used = useMemo(
    () =>
      form && variables
        ? usedVariables(
            `${form.system_instruction}\n${form.template}`,
            variables.map((v) => v.name),
          )
        : new Set<string>(),
    [form, variables],
  );

  if (!form) return null;

  const insert = (name: string, into: Target = target) => {
    (into === "template" ? templateRef : systemRef).current?.insert(variableSnippet(name));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (state.dirty && !state.saving) void state.save().catch(() => undefined);
    }
  };

  const minWords = parseMinWords(form.min_words);
  const current: PromptSnapshot = {
    label: state.dirty ? `Draft v${draft.version} (with unsaved edits)` : `Draft v${draft.version}`,
    name: form.name,
    section_titles: form.section_titles,
    min_words: minWords === undefined ? draft.min_words : minWords,
    system_instruction: form.system_instruction,
    template: form.template,
  };

  return (
    <div onKeyDown={onKeyDown}>
      {children}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Details"
            description={
              <>
                Draft v{draft.version}, created {formatDateTime(draft.created_at)}
                {draft.created_by_name ? ` by ${draft.created_by_name}` : ""}.
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Internal name"
                hint="Only shown in the dashboard."
                error={errors.name}
                required
                className="sm:col-span-2"
              >
                <TextInput
                  value={form.name}
                  maxLength={PROMPT_LIMITS.name}
                  onChange={(event) => state.setField("name", event.target.value)}
                />
              </Field>
              {locales.map((locale) => (
                <Field
                  key={locale}
                  label={`Section title · ${LOCALE_NAMES[locale] ?? locale}`}
                  hint={`Heading of this section in ${LOCALE_NAMES[locale] ?? locale} reports.`}
                  error={errors[`section_titles.${locale}`]}
                >
                  <TextInput
                    value={form.section_titles[locale] ?? ""}
                    maxLength={PROMPT_LIMITS.sectionTitle}
                    lang={locale}
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    onChange={(event) => state.setTitle(locale, event.target.value)}
                  />
                </Field>
              ))}
              <Field
                label="Minimum words"
                hint={
                  globalMinWords !== null
                    ? `Leave empty to use the global setting (${formatNumber(globalMinWords)} words). Shorter replies are requested again.`
                    : "Leave empty to use the global setting. Shorter replies are requested again."
                }
                error={errors.min_words}
              >
                <TextInput
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={PROMPT_LIMITS.minWordsMax}
                  step={1}
                  value={form.min_words}
                  placeholder={
                    globalMinWords !== null ? `${globalMinWords} (global)` : "Global setting"
                  }
                  onChange={(event) => state.setField("min_words", event.target.value)}
                  endAdornment={<span className="text-xs">words</span>}
                  className="pe-14 tabular-nums"
                  dir="ltr"
                />
              </Field>
            </div>
          </Panel>

          <Panel
            title="System instruction"
            description="The writer's voice and rules, sent with every call. Variables work here too."
            actions={
              <InsertVariableSelect
                variables={variables}
                onInsert={(name) => insert(name, "system_instruction")}
              />
            }
          >
            <Field label="System instruction" hideLabel error={errors.system_instruction}>
              <TemplateEditor
                handleRef={systemRef}
                value={form.system_instruction}
                onChange={(value) => state.setField("system_instruction", value)}
                onFocus={() => setTarget("system_instruction")}
                known={known}
                minLines={6}
                maxHeightClassName="max-h-[28rem]"
              />
            </Field>
            <EditorMeta
              value={form.system_instruction}
              max={PROMPT_LIMITS.systemInstruction}
              known={known}
            />
          </Panel>

          <Panel
            title="Template"
            description="The request for this section. {{ variable }} inserts a chart value; {% if … %} … {% endif %} adds conditional text."
            actions={
              <InsertVariableSelect
                variables={variables}
                onInsert={(name) => insert(name, "template")}
              />
            }
          >
            <Field label="Template" hideLabel error={errors.template} required>
              <TemplateEditor
                handleRef={templateRef}
                value={form.template}
                onChange={(value) => state.setField("template", value)}
                onFocus={() => setTarget("template")}
                known={known}
                minLines={12}
              />
            </Field>
            <EditorMeta value={form.template} max={PROMPT_LIMITS.template} known={known} />
          </Panel>

          <Panel
            title="Notes"
            description="Why this version exists, what changed, test results. Not sent to the AI."
          >
            <Field label="Notes" hideLabel error={errors.notes}>
              <TextArea
                rows={3}
                value={form.notes}
                maxLength={PROMPT_LIMITS.notes}
                onChange={(event) => state.setField("notes", event.target.value)}
              />
            </Field>
          </Panel>

          {published ? (
            <Panel
              title="Changes against the published version"
              description={`What publishing would change compared with v${published.version}.`}
              actions={
                <AdminButton
                  size="sm"
                  variant="ghost"
                  iconEnd={showChanges ? "chevronDown" : "chevronRight"}
                  aria-expanded={showChanges}
                  onClick={() => setShowChanges((v) => !v)}
                >
                  {showChanges ? "Hide" : "Show changes"}
                </AdminButton>
              }
            >
              {showChanges ? (
                <VersionChanges
                  before={{ ...published, label: `Published v${published.version}` }}
                  after={current}
                  globalMinWords={globalMinWords}
                />
              ) : (
                <ChangesSummary before={published} after={current} />
              )}
            </Panel>
          ) : null}

          <TryPanel
            idBase="try-draft"
            versionId={draft.id}
            unsaved={{ template: form.template, system_instruction: form.system_instruction }}
            dirty={state.dirty}
            onSave={state.save}
          />
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:flex xl:max-h-[calc(100dvh-6rem)] xl:flex-col">
          <VariablesPanel
            className="xl:min-h-0 xl:flex-1"
            variables={variables}
            loading={variablesLoading}
            error={variablesError}
            onRetry={onRetryVariables}
            used={used}
            onInsert={(name) => insert(name)}
            targetLabel={target === "template" ? "template" : "system instruction"}
          />
        </aside>
      </div>

      <SaveBar state={state} onDiscard={() => setConfirmDiscard(true)} />

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        tone="danger"
        title="Discard your unsaved changes?"
        description={`The draft goes back to its last saved state. Unsaved edits to the ${describeChanges(state.changes)} are lost.`}
        confirmLabel="Discard changes"
        onConfirm={() => {
          state.reset();
          setConfirmDiscard(false);
        }}
      />
    </div>
  );
}

function ChangesSummary({
  before,
  after,
}: {
  before: Omit<PromptSnapshot, "label">;
  after: PromptSnapshot;
}) {
  const changed: string[] = [];
  if (before.name.trim() !== after.name.trim()) changed.push("name");
  const titles = (t: Record<string, string>) =>
    JSON.stringify(
      Object.entries(t)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v)
        .sort(),
    );
  if (titles(before.section_titles) !== titles(after.section_titles))
    changed.push("section titles");
  if (before.min_words !== after.min_words) changed.push("minimum words");
  if (before.system_instruction.trim() !== after.system_instruction.trim())
    changed.push("system instruction");
  if (before.template.trim() !== after.template.trim()) changed.push("template");
  return (
    <p className="text-sm text-ink-soft">
      {changed.length
        ? `Changed: ${changed.join(", ")}.`
        : "Same text as the published version so far. Edit the template or system instruction above."}
    </p>
  );
}
