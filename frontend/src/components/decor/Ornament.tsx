import { cn } from "@/lib/cn";

interface DecorProps {
  className?: string;
}

/**
 * Horizontal flourish inspired by the rule under the logo wordmark: scrolls, a hairline and a
 * centre diamond. Colour = currentColor (use `text-ornament`). Size it with width/height classes.
 */
export function Ornament({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 240 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("block h-4 w-40", className)}
    >
      <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <path d="M36 12h68M136 12h68" />
        <path d="M36 12c-6 0-11-2.4-13-6.2-1.6-3 .4-5.8 3.3-5.3 2.7.5 3.4 3.8 1.2 5" />
        <path d="M36 12c-6 0-11 2.4-13 6.2-1.6 3 .4 5.8 3.3 5.3 2.7-.5 3.4-3.8 1.2-5" />
        <path d="M204 12c6 0 11-2.4 13-6.2 1.6-3-.4-5.8-3.3-5.3-2.7.5-3.4 3.8-1.2 5" />
        <path d="M204 12c6 0 11 2.4 13 6.2 1.6 3-.4 5.8-3.3 5.3-2.7-.5-3.4-3.8-1.2-5" />
        <path d="M18 12H6M222 12h12" strokeOpacity="0.6" />
      </g>
      <g fill="currentColor">
        <path d="m120 4 6.5 8-6.5 8-6.5-8Z" />
        <circle cx="109" cy="12" r="1.6" />
        <circle cx="131" cy="12" r="1.6" />
        <circle cx="3" cy="12" r="1.2" />
        <circle cx="237" cy="12" r="1.2" />
      </g>
    </svg>
  );
}

/** Four-pointed star (the logo's sparkle). */
export function Sparkle({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4", className)}
    >
      <path fill="currentColor" d="M12 0l2.1 9.9L24 12l-9.9 2.1L12 24l-2.1-9.9L0 12l9.9-2.1Z" />
    </svg>
  );
}

/** Crescent moon. */
export function Crescent({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4", className)}
    >
      <path fill="currentColor" d="M15.5 2.5A9.8 9.8 0 1 0 21.5 19 8 8 0 1 1 15.5 2.5Z" />
    </svg>
  );
}

/** Yin–yang, drawn in currentColor on a transparent background. */
export function YinYang({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={cn("size-10", className)}
    >
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        fill="currentColor"
        d="M24 1.5a22.5 22.5 0 0 1 0 45 11.25 11.25 0 0 1 0-22.5 11.25 11.25 0 0 0 0-22.5Z"
      />
      <circle cx="24" cy="12.75" r="3.4" fill="currentColor" />
      <circle cx="24" cy="35.25" r="3.4" className="fill-surface" />
    </svg>
  );
}

/** Thin gold hairline that fades at both ends (`<GoldRule className="my-8" />`). */
export function GoldRule({ className }: DecorProps) {
  return <hr aria-hidden="true" className={cn("rule-gold", className)} />;
}
