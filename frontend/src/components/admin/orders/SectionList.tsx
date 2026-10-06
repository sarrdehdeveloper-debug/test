"use client";

import { useId, useState } from "react";
import { EmptyState } from "@/components/admin/EmptyState";
import { Icon } from "@/components/admin/icons";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/admin/format";
import type { AdminSection, OrderStatus } from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import { ErrorText } from "./ErrorText";
import { GENERATING_STATUSES } from "./orderHelpers";

const ARABIC = /[؀-ۿ]/;
const SLOTS = [1, 2, 3, 4, 5, 6];

function SectionContent({ section, locale }: { section: AdminSection; locale: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!section.content) return null;
  // The AI may answer in another script than the order locale: pick the font/direction by content.
  const lang = ARABIC.test(section.content.slice(0, 400)) ? "ar" : locale;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1 rounded text-xs font-semibold text-gold-deep hover:text-ink"
      >
        <Icon
          name="chevronRight"
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        {open ? "Hide content" : "Show content"}
      </button>
      {open ? (
        <div id={id} className="mt-2 rounded-lg border border-stone-200 bg-ivory/60">
          <div
            lang={lang}
            dir="auto"
            tabIndex={0}
            className="max-h-96 overflow-auto px-3.5 py-3 text-[0.8125rem] leading-relaxed break-words whitespace-pre-wrap text-ink"
          >
            {section.content}
            {section.content_truncated ? "…" : ""}
          </div>
          {section.content_truncated ? (
            <p className="border-t border-stone-200 px-3.5 py-2 text-xs text-ink-soft">
              Showing the first {formatNumber(section.content.length)} characters of the Markdown
              source. The full text is in the PDF.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface SectionListProps {
  sections: AdminSection[];
  orderStatus: OrderStatus;
  /** Order locale (content language fallback). */
  locale: string;
}

/** The six generated report sections with status, metrics, errors and the (truncated) text. */
export function SectionList({ sections, orderStatus, locale }: SectionListProps) {
  const generating = GENERATING_STATUSES.includes(orderStatus);
  if (!sections.length && !generating) {
    return (
      <EmptyState
        compact
        icon="prompts"
        title="No sections yet"
        description={
          orderStatus === "awaiting_payment" || orderStatus === "abandoned"
            ? "Sections are written by the AI after the payment."
            : "This order has no generated sections."
        }
      />
    );
  }
  const bySlot = new Map(sections.map((section) => [section.slot, section]));
  const slots = [...new Set([...SLOTS, ...sections.map((s) => s.slot)])].sort((a, b) => a - b);

  return (
    <ol className="divide-y divide-stone-100">
      {slots.map((slot) => {
        const section = bySlot.get(slot);
        return (
          <li key={slot} className="flex gap-3 px-4 py-3.5 sm:px-5">
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ring-1",
                section?.status === "done"
                  ? "bg-gold-pale/60 text-gold-deep ring-gold/30"
                  : section?.status === "failed"
                    ? "bg-danger-soft text-danger ring-danger/20"
                    : "bg-stone-100 text-ink-soft ring-stone-200",
              )}
            >
              {slot}
            </span>
            <div className="min-w-0 flex-1">
              {section ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-sm font-medium text-ink">
                      <span className="sr-only">Section {slot}: </span>
                      <span dir="auto" lang={ARABIC.test(section.title) ? "ar" : undefined}>
                        {section.title}
                      </span>
                    </h3>
                    <StatusBadge kind="section" status={section.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-soft">
                    <span>
                      <span className="font-medium text-ink tabular-nums">
                        {formatNumber(section.word_count)}
                      </span>{" "}
                      words
                    </span>
                    <span>
                      <span className="font-medium text-ink tabular-nums">{section.attempts}</span>{" "}
                      {section.attempts === 1 ? "attempt" : "attempts"}
                    </span>
                    {section.model ? <span className="font-mono">{section.model}</span> : null}
                    {section.input_tokens !== null || section.output_tokens !== null ? (
                      <span title="Input / output tokens">
                        {formatNumber(section.input_tokens)} in /{" "}
                        {formatNumber(section.output_tokens)} out
                      </span>
                    ) : null}
                    <time dateTime={section.updated_at} title={formatDateTime(section.updated_at)}>
                      {formatRelative(section.updated_at)}
                    </time>
                  </p>
                  {section.last_error ? (
                    <ErrorText
                      text={section.last_error}
                      label={section.status === "failed" ? "Error" : "Earlier attempt failed"}
                      className="mt-2"
                    />
                  ) : null}
                  <SectionContent section={section} locale={locale} />
                </>
              ) : (
                <p className="py-1 text-sm text-ink-soft">
                  {generating ? "Waiting to be written…" : "Not generated"}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
