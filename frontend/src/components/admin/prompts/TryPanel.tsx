"use client";

import { useEffect, useId, useState } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { Badge } from "@/components/admin/StatusBadge";
import { CopyButton } from "@/components/admin/CopyButton";
import { Icon } from "@/components/admin/icons";
import { adminApi, toAdminApiError, type AdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { formatDuration, formatNumber } from "@/lib/admin/format";
import { useAdminLocales, useAdminMutation } from "@/lib/admin/hooks";
import type { Locale, PromptPreviewIn, PromptPreviewOut, PromptTestOut } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { Tabs, tabPanelProps } from "./Tabs";
import { countWords } from "./template";

const LOCALE_LABELS: Record<string, string> = { en: "English", ar: "Arabic" };

function LocaleSwitch({
  value,
  onChange,
  locales,
  label,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  locales: Locale[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-stone-200 bg-stone-100/70 p-0.5"
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          role="radio"
          aria-checked={value === locale}
          onClick={() => onChange(locale)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-semibold transition-colors",
            value === locale
              ? "bg-white text-ink shadow-sm ring-1 ring-stone-200"
              : "text-ink-soft hover:text-ink",
          )}
        >
          {LOCALE_LABELS[locale] ?? locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function OutputBlock({
  title,
  text,
  empty,
}: {
  title: string;
  text: string | null;
  empty?: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-ink-soft">
          {title}
          {text ? (
            <span className="ms-2 font-normal text-stone-500">
              {formatNumber(countWords(text))} words · {formatNumber(text.length)} characters
            </span>
          ) : null}
        </h4>
        {text ? <CopyButton value={text} label={`Copy ${title.toLowerCase()}`} /> : null}
      </div>
      {text ? (
        <div
          tabIndex={0}
          className="max-h-[28rem] overflow-auto rounded-lg border border-stone-200 bg-ivory/50 px-3.5 py-3 text-[0.8125rem] leading-relaxed break-words whitespace-pre-wrap text-ink [unicode-bidi:plaintext]"
        >
          {text}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-stone-200 px-3.5 py-3 text-[0.8125rem] text-ink-soft">
          {empty ?? "Empty"}
        </p>
      )}
    </section>
  );
}

function ErrorBox({ error, onRetry }: { error: AdminApiError; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-danger/20 bg-danger-soft/60 px-3 py-2.5 text-sm text-danger"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {error.code === "invalid_template" ? (
          <>
            <span className="font-semibold">The template does not render: </span>
            <code className="font-mono text-[0.8125rem]">{error.message}</code>
          </>
        ) : (
          adminErrorMessage(error)
        )}
      </p>
      {onRetry && !error.isRateLimited && error.code !== "invalid_template" ? (
        <AdminButton
          size="xs"
          variant="ghost"
          icon="refresh"
          onClick={onRetry}
          className="text-danger"
        >
          Try again
        </AdminButton>
      ) : null}
    </div>
  );
}

type TryTab = "preview" | "test";

export interface TryPanelProps {
  versionId: number;
  /** Unsaved editor text (the draft editor): previews use it instead of the saved text. */
  unsaved?: { template: string; system_instruction: string };
  /** The editor has unsaved changes (the AI test always runs the saved version). */
  dirty?: boolean;
  /** Save the draft before testing; should reject when saving fails. */
  onSave?: () => Promise<unknown>;
  /** Prefix for ids (several panels can be mounted). */
  idBase: string;
  className?: string;
}

/**
 * "Preview" (render the prompt with sample chart data, unsaved text included) and "Test with AI"
 * (one real AI call with the saved version: output, word count vs minimum, model, finish reason).
 */
export function TryPanel({
  versionId,
  unsaved,
  dirty = false,
  onSave,
  idBase,
  className,
}: TryPanelProps) {
  const { locales, defaultLocale } = useAdminLocales();
  const [tab, setTab] = useState<TryTab>("preview");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const statusId = useId();

  /* ---------------------------------------------------------------- preview */
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const preview = useAdminMutation(
    (body: PromptPreviewIn) =>
      adminApi.post<PromptPreviewOut>(`/prompts/versions/${versionId}/preview`, body),
    { errorMessage: false },
  );
  const sourceKey = unsaved ? `${unsaved.system_instruction}\u0000${unsaved.template}` : "saved";
  const renderPreview = (nextLocale = locale) => {
    setPreviewSource(sourceKey);
    void preview.mutate({
      locale: nextLocale,
      ...(unsaved
        ? {
            template: unsaved.template.trim() ? unsaved.template : undefined,
            system_instruction: unsaved.system_instruction,
          }
        : {}),
    });
  };
  const previewStale = preview.data !== undefined && previewSource !== sourceKey;

  /* ---------------------------------------------------------------- AI test */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const test = useAdminMutation(
    (body: { locale: Locale }) =>
      adminApi.post<PromptTestOut>(`/prompts/versions/${versionId}/test`, body),
    {
      errorMessage: false,
      onError: (error) => {
        if (error.isRateLimited) {
          const at = Date.now();
          setNow(at);
          setBlockedUntil(at + (error.retryAfterSeconds ?? 60) * 1000);
        }
      },
    },
  );
  const [testLocale, setTestLocale] = useState<Locale | null>(null);
  const [saveError, setSaveError] = useState<AdminApiError | null>(null);

  const ticking = test.pending || (blockedUntil !== null && blockedUntil > now);
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  const blockedSeconds =
    blockedUntil && blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
  const elapsed = startedAt && test.pending ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;

  const runTest = async () => {
    setSaveError(null);
    if (dirty && onSave) {
      try {
        await onSave();
      } catch (err) {
        setSaveError(toAdminApiError(err));
        return;
      }
    }
    const started = Date.now();
    setStartedAt(started);
    setNow(started);
    setTestLocale(locale);
    void test.mutate({ locale });
  };

  const result = test.data;
  const belowMin = result ? result.word_count < result.min_words : false;
  const finish = result?.finish_reason?.toUpperCase() ?? null;
  const cutOff = finish !== null && finish !== "STOP" && finish !== "FINISH_REASON_STOP";

  return (
    <section
      aria-labelledby={`${idBase}-title`}
      className={cn(
        "min-w-0 rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgb(31_36_48/0.04)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-3.5 sm:px-5">
        <div className="min-w-0 pb-2">
          <h2 id={`${idBase}-title`} className="text-[0.95rem] font-semibold text-ink">
            Try it
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
            Uses a sample chart (Leo Sun, Pisces Moon, Metal Horse year…).
          </p>
        </div>
        <LocaleSwitch
          value={locale}
          onChange={setLocale}
          locales={locales}
          label="Report language"
        />
      </header>
      <Tabs
        label="Try the prompt"
        idBase={idBase}
        items={[
          { value: "preview", label: "Preview prompt" },
          { value: "test", label: "Test with AI" },
        ]}
        value={tab}
        onChange={setTab}
        className="mt-1 px-2 sm:px-3"
      />

      <div
        {...tabPanelProps(idBase, tab)}
        className="space-y-4 px-4 py-4 focus:outline-none sm:px-5"
      >
        {tab === "preview" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <AdminButton
                variant="primary"
                size="sm"
                icon="eye"
                loading={preview.pending}
                onClick={() => renderPreview()}
              >
                {preview.data ? "Render again" : "Render preview"}
              </AdminButton>
              <p className="text-xs text-ink-soft" aria-live="polite">
                {preview.pending
                  ? "Rendering…"
                  : unsaved
                    ? "Includes your unsaved changes. Nothing is sent to the AI."
                    : "Renders the saved version. Nothing is sent to the AI."}
              </p>
            </div>
            {preview.error ? (
              <ErrorBox error={preview.error} onRetry={() => renderPreview()} />
            ) : null}
            {preview.data && !preview.error ? (
              <div className={cn("space-y-4 transition-opacity", preview.pending && "opacity-60")}>
                {previewStale || preview.data.locale !== locale ? (
                  <p className="flex items-center gap-2 rounded-lg bg-warning-soft/70 px-3 py-2 text-xs text-warning">
                    <Icon name="info" className="size-3.5 shrink-0" />
                    {preview.data.locale !== locale
                      ? `This preview is in ${LOCALE_LABELS[preview.data.locale] ?? preview.data.locale}. Render again for ${LOCALE_LABELS[locale] ?? locale}.`
                      : "The text changed since this preview. Render again to update it."}
                  </p>
                ) : null}
                <OutputBlock
                  title="System instruction"
                  text={preview.data.rendered_system_instruction}
                  empty="No system instruction."
                />
                <OutputBlock title="Prompt" text={preview.data.rendered_prompt} />
              </div>
            ) : !preview.error && !preview.pending ? (
              <p className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-[0.8125rem] text-ink-soft">
                Render the preview to see exactly what the AI receives, with the sample values
                filled in.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <AdminButton
                variant="gold"
                size="sm"
                icon="sparkle"
                loading={test.pending}
                disabled={blockedSeconds > 0}
                onClick={() => void runTest()}
                aria-describedby={statusId}
              >
                {dirty ? "Save and run test" : result ? "Run again" : "Run test"}
              </AdminButton>
              <p id={statusId} className="text-xs text-ink-soft" aria-live="polite">
                {test.pending
                  ? `Waiting for the AI… ${elapsed} s`
                  : blockedSeconds > 0
                    ? `Test limit reached. Try again in ${formatDuration(blockedSeconds)}.`
                    : dirty
                      ? "The test runs the saved version, so your changes are saved first."
                      : "One real AI call with the saved version (limit: 10 per minute)."}
              </p>
            </div>
            {saveError ? <ErrorBox error={saveError} /> : null}
            {/* A rate limit is shown as the countdown next to the button. */}
            {test.error && !test.error.isRateLimited ? (
              <ErrorBox error={test.error} onRetry={() => void runTest()} />
            ) : null}
            {test.pending && !result ? (
              <div
                className="space-y-2.5 rounded-lg border border-stone-200 px-4 py-4"
                aria-hidden="true"
              >
                {[100, 92, 97, 60].map((w) => (
                  <span
                    key={w}
                    className="block h-3.5 animate-pulse rounded bg-stone-200/70"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            ) : null}
            {result ? (
              <div className={cn("space-y-3 transition-opacity", test.pending && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={belowMin ? "danger" : "success"} dot>
                    {formatNumber(result.word_count)} words · minimum{" "}
                    {formatNumber(result.min_words)}
                  </Badge>
                  <Badge tone="neutral" className="font-mono">
                    {result.model}
                  </Badge>
                  {finish ? (
                    <Badge
                      tone={cutOff ? "warning" : "neutral"}
                      title="Finish reason reported by the model"
                    >
                      {cutOff ? `Stopped: ${finish}` : "Complete"}
                    </Badge>
                  ) : null}
                  {testLocale ? (
                    <span className="text-xs text-ink-soft">
                      {LOCALE_LABELS[testLocale] ?? testLocale} sample
                    </span>
                  ) : null}
                </div>
                {belowMin ? (
                  <p className="text-xs text-danger">
                    Below the minimum: in a real order this reply would be requested again.
                  </p>
                ) : null}
                {cutOff ? (
                  <p className="text-xs text-warning">
                    The reply was cut off ({finish}). If this repeats, raise “Max output tokens” in
                    Settings.
                  </p>
                ) : null}
                <div className="max-h-[36rem] overflow-auto rounded-lg border border-stone-200 bg-ivory/40 px-4 py-3.5 sm:px-5">
                  <div
                    lang={testLocale ?? undefined}
                    dir={testLocale === "ar" ? "rtl" : "ltr"}
                    className="prose-zb max-w-none text-[0.9375rem]"
                    // Sanitised Markdown rendered by the API.
                    dangerouslySetInnerHTML={{ __html: result.output_html }}
                  />
                </div>
              </div>
            ) : !test.pending && !test.error ? (
              <p className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-[0.8125rem] text-ink-soft">
                Run a test to see what the AI writes for this section with the sample chart.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
