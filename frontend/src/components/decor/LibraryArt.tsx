import { cn } from "@/lib/cn";

/** Decorative open book under an orbit of stars (Galaxy Library teaser). */
export function LibraryArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 360"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <linearGradient id="la-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E9C77B" />
          <stop offset="0.55" stopColor="#C78933" />
          <stop offset="1" stopColor="#A46F26" />
        </linearGradient>
        <radialGradient id="la-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#E9C77B" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#C78933" stopOpacity="0.18" />
          <stop offset="1" stopColor="#C78933" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="240" cy="150" rx="210" ry="120" fill="url(#la-glow)" />
      <g fill="none" stroke="url(#la-gold)" strokeWidth="1">
        <ellipse
          cx="240"
          cy="140"
          rx="200"
          ry="62"
          transform="rotate(-12 240 140)"
          strokeOpacity="0.55"
        />
        <ellipse
          cx="240"
          cy="140"
          rx="150"
          ry="44"
          transform="rotate(-12 240 140)"
          strokeOpacity="0.4"
          strokeDasharray="3 7"
        />
        <ellipse
          cx="240"
          cy="140"
          rx="100"
          ry="28"
          transform="rotate(-12 240 140)"
          strokeOpacity="0.35"
        />
      </g>
      <g fill="#E9C77B">
        <circle cx="52" cy="160" r="5" />
        <circle cx="398" cy="78" r="3.5" />
        <circle cx="330" cy="176" r="2.5" />
        <circle cx="148" cy="112" r="2.2" />
        <path d="M240 46l3.4 16.6L260 66l-16.6 3.4L240 86l-3.4-16.6L220 66l16.6-3.4Z" />
        <path
          transform="translate(402 214) scale(0.45)"
          d="M0-20 3.4-3.4 20 0 3.4 3.4 0 20-3.4 3.4-20 0-3.4-3.4Z"
        />
        <path
          transform="translate(84 74) scale(0.35)"
          d="M0-20 3.4-3.4 20 0 3.4 3.4 0 20-3.4 3.4-20 0-3.4-3.4Z"
        />
      </g>
      <g strokeLinejoin="round">
        <path
          d="M240 238c-38-22-92-28-150-20v104c58-8 112-2 150 20Z"
          fill="#16223A"
          stroke="url(#la-gold)"
          strokeWidth="1.6"
        />
        <path
          d="M240 238c38-22 92-28 150-20v104c-58-8-112-2-150 20Z"
          fill="#16223A"
          stroke="url(#la-gold)"
          strokeWidth="1.6"
        />
        <path d="M240 238v104" stroke="url(#la-gold)" strokeWidth="1.6" />
        <g stroke="#C78933" strokeOpacity="0.55" strokeWidth="1" fill="none">
          <path d="M108 236c40-5 78 0 112 14M108 256c40-5 78 0 112 14M108 276c40-5 78 0 112 14M108 296c40-5 78 0 112 14" />
          <path d="M372 236c-40-5-78 0-112 14M372 256c-40-5-78 0-112 14M372 276c-40-5-78 0-112 14M372 296c-40-5-78 0-112 14" />
        </g>
      </g>
      <path
        d="M240 232c-8-30-8-60 0-96"
        stroke="url(#la-gold)"
        strokeOpacity="0.6"
        strokeWidth="1"
        strokeDasharray="2 5"
        fill="none"
      />
    </svg>
  );
}
