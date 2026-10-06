import { StarField } from "@/components/decor/StarField";
import { cn } from "@/lib/cn";

/**
 * Decorative medallion for content without an image (offers, articles): concentric gold rings, twelve ticks
 * (one per sign / animal) and the logo sparkle on a night sky. Fills its `relative` parent.
 */
export function CelestialArt({ className, seed = 5 }: { className?: string; seed?: number }) {
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <div aria-hidden="true" className={cn("absolute inset-0 bg-night-sky", className)}>
      <StarField density="low" seed={seed} />
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id={`oa-gold-${seed}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E9C77B" />
            <stop offset="0.55" stopColor="#C78933" />
            <stop offset="1" stopColor="#A46F26" />
          </linearGradient>
          <radialGradient id={`oa-glow-${seed}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#E9C77B" stopOpacity="0.45" />
            <stop offset="0.45" stopColor="#C78933" stopOpacity="0.14" />
            <stop offset="1" stopColor="#C78933" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="150" r="140" fill={`url(#oa-glow-${seed})`} />
        <g
          transform="translate(200 150)"
          fill="none"
          stroke={`url(#oa-gold-${seed})`}
          strokeLinecap="round"
        >
          <circle r="96" strokeOpacity="0.45" strokeWidth="1" />
          <circle r="84" strokeOpacity="0.6" strokeWidth="1" strokeDasharray="2 6" />
          <circle r="60" strokeOpacity="0.8" strokeWidth="1.2" />
          {ticks.map((deg) => (
            <path
              key={deg}
              d="M0-96v-10"
              transform={`rotate(${deg})`}
              strokeWidth="1.4"
              strokeOpacity="0.8"
            />
          ))}
          <circle cx="59" cy="-60" r="3" fill="#E9C77B" stroke="none" />
          <circle cx="-59" cy="60" r="2" fill="#E9C77B" stroke="none" />
        </g>
        <path
          fill={`url(#oa-gold-${seed})`}
          transform="translate(200 150) scale(1.9)"
          d="M0-20 3.4-3.4 20 0 3.4 3.4 0 20-3.4 3.4-20 0-3.4-3.4Z"
        />
      </svg>
    </div>
  );
}
