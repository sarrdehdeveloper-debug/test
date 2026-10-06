"use client";

import { Fragment, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { diffHunks, diffLines, diffStats, type DiffLine, type DiffStats } from "./diff";

/** "+12 −3" with colours (or "No changes"). */
export function DiffStatsLabel({ stats, className }: { stats: DiffStats; className?: string }) {
  if (stats.same) return <span className={cn("text-xs text-ink-soft", className)}>No changes</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums",
        className,
      )}
    >
      <span className="text-success" title={`${stats.added} lines added`}>
        +{stats.added}
      </span>
      <span className="text-danger" title={`${stats.removed} lines removed`}>
        −{stats.removed}
      </span>
      <span className="sr-only">
        {stats.added} lines added, {stats.removed} lines removed
      </span>
    </span>
  );
}

function Row({ line }: { line: DiffLine }) {
  const sign = line.op === "insert" ? "+" : line.op === "delete" ? "−" : " ";
  return (
    <tr
      className={cn(
        line.op === "insert" && "bg-success-soft/70",
        line.op === "delete" && "bg-danger-soft/70",
      )}
    >
      <td className="w-10 border-e border-stone-200 px-2 text-end align-top text-stone-400 select-none">
        {line.oldLine ?? ""}
      </td>
      <td className="w-10 border-e border-stone-200 px-2 text-end align-top text-stone-400 select-none">
        {line.newLine ?? ""}
      </td>
      <td
        className={cn(
          "w-5 px-1 text-center align-top select-none",
          line.op === "insert"
            ? "text-success"
            : line.op === "delete"
              ? "text-danger"
              : "text-stone-300",
        )}
        aria-hidden="true"
      >
        {sign}
      </td>
      <td className="px-2 align-top break-words whitespace-pre-wrap text-ink [unicode-bidi:plaintext]">
        {line.op !== "equal" ? (
          <span className="sr-only">{line.op === "insert" ? "Added: " : "Removed: "}</span>
        ) : null}
        {line.text || "​"}
      </td>
    </tr>
  );
}

export interface DiffViewProps {
  /** Old text (e.g. the published version). */
  before: string;
  /** New text (e.g. the draft). */
  after: string;
  /** Accessible caption ("Template: published v1 → draft v2"). */
  caption: string;
  /** Unchanged lines kept around each change (default 3). */
  context?: number;
  className?: string;
}

/**
 * Unified line diff with old/new line numbers; long unchanged stretches collapse into
 * "Show N unchanged lines" rows.
 */
export function DiffView({ before, after, caption, context = 3, className }: DiffViewProps) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const stats = diffStats(lines);
  const hunks = useMemo(() => diffHunks(lines, context), [lines, context]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());

  if (stats.same) {
    return (
      <p
        className={cn(
          "rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-ink-soft",
          className,
        )}
      >
        No differences.
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-stone-200 bg-white", className)}>
      <table className="w-full border-collapse font-mono text-xs leading-5">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Old line</th>
            <th scope="col">New line</th>
            <th scope="col">Change</th>
            <th scope="col">Text</th>
          </tr>
        </thead>
        <tbody>
          {hunks.map((hunk, index) => {
            if (hunk.kind === "lines") {
              return (
                <Fragment key={index}>
                  {hunk.lines.map((line, i) => (
                    <Row key={i} line={line} />
                  ))}
                </Fragment>
              );
            }
            if (expanded.has(index)) {
              const start = lines.findIndex(
                (line) => line.op === "equal" && line.oldLine === hunk.oldLine,
              );
              return (
                <Fragment key={index}>
                  {lines.slice(start, start + hunk.count).map((line, i) => (
                    <Row key={i} line={line} />
                  ))}
                </Fragment>
              );
            }
            return (
              <tr key={index} className="bg-stone-50">
                <td colSpan={4} className="border-y border-stone-200 p-0">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => new Set(prev).add(index))}
                    className="w-full px-3 py-1 text-start font-sans text-xs text-ink-soft hover:bg-stone-100 hover:text-ink"
                  >
                    ⋯ Show {hunk.count} unchanged {hunk.count === 1 ? "line" : "lines"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
