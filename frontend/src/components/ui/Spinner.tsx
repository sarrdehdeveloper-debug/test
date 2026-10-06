import { cn } from "@/lib/cn";

export interface SpinnerProps {
  /** Accessible label; when omitted the spinner is decorative (aria-hidden). */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "size-4", md: "size-6", lg: "size-10" } as const;

/** Gold orbit spinner. Uses currentColor for the track. */
export function Spinner({ label, size = "md", className }: SpinnerProps) {
  const svg = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      // data-spinner: keeps a slow rotation under prefers-reduced-motion (see globals.css).
      data-spinner=""
      className={cn("animate-spin", SIZES[size], className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path
        d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
        stroke="#C78933"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="2.5" r="1.6" fill="#E9C77B" />
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}
