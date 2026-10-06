"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export interface TocNavEntry {
  id: string;
  text: string;
}

/**
 * "On this page" list for long documents. Highlights the section being read (scroll spy with
 * IntersectionObserver); without JavaScript it is a plain list of anchor links.
 */
export function TocNav({ entries, className }: { entries: TocNavEntry[]; className?: string }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) visible.set(record.target.id, record.isIntersecting);
        // The first heading inside the reading band wins; otherwise keep the last one passed.
        const current = headings.find((h) => visible.get(h.id));
        if (current) {
          setActive(current.id);
          return;
        }
        const passed = headings.filter((h) => h.getBoundingClientRect().top < 120);
        setActive(passed.length ? passed[passed.length - 1].id : null);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <ol className={cn("space-y-1 text-[0.95rem]", className)}>
      {entries.map((entry) => {
        const isActive = entry.id === active;
        return (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              aria-current={isActive ? "location" : undefined}
              className={cn(
                "block rounded-lg border-s-2 py-1.5 ps-3 pe-2 leading-snug transition-colors",
                isActive
                  ? "border-ornament bg-gold-light/10 font-medium text-fg"
                  : "border-transparent text-muted hover:border-line hover:text-fg",
              )}
            >
              {entry.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
