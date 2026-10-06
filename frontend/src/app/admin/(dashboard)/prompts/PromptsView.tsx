"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { Badge } from "@/components/admin/StatusBadge";
import { formatDate, formatNumber, formatRelative } from "@/lib/admin/format";
import { orderedTitles } from "@/components/admin/prompts/promptForm";
import { useAdminQuery } from "@/lib/admin/hooks";
import type { PromptSlotSummary, PromptSlotsOut, SettingsOut } from "@/lib/admin/types";
import { cn } from "@/lib/cn";

const LOCALE_NAMES: Record<string, string> = { en: "EN", ar: "AR" };

const STEPS: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "plus", title: "Draft", text: "Start a draft from the live version and edit it." },
  {
    icon: "eye",
    title: "Preview & test",
    text: "Render it with a sample chart, then run one AI test.",
  },
  {
    icon: "check",
    title: "Publish",
    text: "New orders use it at once; the old version is archived.",
  },
];

function SlotCard({
  summary,
  globalMinWords,
}: {
  summary: PromptSlotSummary;
  globalMinWords: number | null;
}) {
  const live = summary.published;
  const draft = summary.draft;
  const shown = live ?? draft;
  const titles = orderedTitles(shown?.section_titles ?? {});
  const minWords = live?.min_words ?? null;
  return (
    <li className="min-w-0">
      <Link
        href={`/admin/prompts/${summary.slot}`}
        className="group flex h-full flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgb(31_36_48/0.04)] transition-[border-color,box-shadow] hover:border-gold/50 hover:shadow-card sm:p-5"
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-night font-display text-lg leading-none font-semibold text-gold-light ring-2 ring-gold/30 ring-offset-2 ring-offset-white"
          >
            {summary.slot}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-semibold tracking-wider text-ink-soft uppercase">
              Section {summary.slot}
            </p>
            <h2 className="mt-0.5 font-serif text-xl leading-snug font-semibold text-ink group-hover:text-night-3">
              {shown?.name ?? "Not set up"}
            </h2>
          </div>
        </div>

        {titles.length ? (
          <dl className="mt-4 space-y-1.5 border-t border-stone-100 pt-3.5">
            {titles.map(([locale, title]) => (
              <div key={locale} className="flex items-baseline gap-2.5">
                <dt className="w-6 shrink-0 font-mono text-[0.65rem] font-semibold text-stone-400">
                  {LOCALE_NAMES[locale] ?? locale.toUpperCase()}
                </dt>
                <dd
                  lang={locale}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm text-ink",
                    locale === "ar" && "text-start",
                  )}
                >
                  {title}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
          {live ? (
            <Badge
              tone="success"
              dot
              title={live.published_at ? `Published ${formatDate(live.published_at)}` : undefined}
            >
              v{live.version} live
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              Not published
            </Badge>
          )}
          {draft ? (
            <Badge
              tone="warning"
              dot="pulse"
              title={`Draft created ${formatRelative(draft.created_at)}${draft.created_by_name ? ` by ${draft.created_by_name}` : ""}`}
            >
              Draft v{draft.version}
            </Badge>
          ) : null}
          <Badge tone="neutral">
            {summary.versions_count} {summary.versions_count === 1 ? "version" : "versions"}
          </Badge>
          <Badge tone="neutral" title="Minimum words per reply">
            {minWords !== null
              ? `Min ${formatNumber(minWords)} words`
              : `Min words: global${globalMinWords !== null ? ` (${globalMinWords})` : ""}`}
          </Badge>
        </div>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gold-deep">
          {draft ? "Continue editing" : "Open"}
          <Icon
            name="arrowRight"
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  );
}

/** `/admin/prompts`: the six section prompts of the paid report. */
export function PromptsView() {
  const query = useAdminQuery<PromptSlotsOut>("/prompts");
  const settings = useAdminQuery<SettingsOut>("/settings");
  const globalMinWords = settings.data?.values.min_words ?? null;
  const drafts = query.data?.slots.filter((s) => s.draft).length ?? 0;

  return (
    <>
      <PageHeader
        title="Prompts"
        description="The paid report has six sections. Each one is written by the AI from its own prompt, in this order. Edit a prompt in a draft, check it, then publish it."
        badge={
          drafts ? (
            <Badge tone="warning" dot>
              {drafts} unpublished {drafts === 1 ? "draft" : "drafts"}
            </Badge>
          ) : null
        }
      />

      <ol className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="How prompt changes work">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex items-start gap-3 rounded-xl border border-gold/20 bg-gold-pale/25 px-4 py-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-gold-deep ring-1 ring-gold/30">
              <Icon name={step.icon} className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {index + 1}. {step.title}
              </span>
              <span className="block text-xs leading-relaxed text-ink-soft">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>

      {query.error && !query.data ? (
        <Panel>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Panel>
      ) : (
        <ul
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-busy={query.loading || undefined}
        >
          {query.data
            ? query.data.slots.map((summary) => (
                <SlotCard key={summary.slot} summary={summary} globalMinWords={globalMinWords} />
              ))
            : Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="rounded-xl border border-stone-200 bg-white p-5">
                  <div className="flex items-center gap-3.5">
                    <Skeleton className="size-11 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-5 w-48 max-w-full" />
                    </div>
                  </div>
                  <Skeleton className="mt-5 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                  <Skeleton className="mt-6 h-5 w-56 max-w-full" />
                </li>
              ))}
        </ul>
      )}
    </>
  );
}
