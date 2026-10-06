import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";

export interface CodeChipProps {
  code: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
  size?: "md" | "lg";
  className?: string;
}

/** Discount code ticket with a copy button; tone-aware (ivory, parchment or night surfaces). */
export function CodeChip({
  code,
  copyLabel,
  copiedLabel,
  failedLabel,
  size = "md",
  className,
}: CodeChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-ornament/70 bg-gold-light/10 py-1 pe-1",
        size === "lg" ? "ps-5" : "ps-4",
        className,
      )}
    >
      <code
        lang="en"
        dir="ltr"
        className={cn(
          "truncate font-display font-semibold tracking-[0.16em] text-accent select-all",
          size === "lg" ? "text-lg" : "text-sm",
        )}
      >
        {code}
      </code>
      <CopyButton
        value={code}
        label={copyLabel}
        copiedLabel={copiedLabel}
        failedLabel={failedLabel}
      />
    </span>
  );
}
