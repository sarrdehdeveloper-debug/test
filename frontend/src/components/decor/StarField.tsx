import { cn } from "@/lib/cn";

/** Deterministic PRNG so the server-rendered star field is identical on every render. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DENSITY = { low: 55, medium: 95, high: 150 } as const;
const W = 1200;
const H = 800;

interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
  gold: boolean;
  twinkle: boolean;
  delay: number;
}

function makeStars(count: number, seed: number) {
  const rand = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const big = rand() > 0.9;
    stars.push({
      x: Math.round(rand() * W * 10) / 10,
      y: Math.round(rand() * H * 10) / 10,
      r: Math.round((big ? 1.3 + rand() * 0.9 : 0.4 + rand() * 0.8) * 100) / 100,
      o: Math.round((0.35 + rand() * 0.6) * 100) / 100,
      gold: rand() > 0.72,
      twinkle: rand() > 0.78,
      delay: Math.round(rand() * 50) / 10,
    });
  }
  const sparkles = Array.from({ length: Math.max(3, Math.round(count / 22)) }, () => ({
    x: Math.round(rand() * W),
    y: Math.round(rand() * H),
    s: Math.round((5 + rand() * 7) * 10) / 10,
    delay: Math.round(rand() * 50) / 10,
  }));
  return { stars, sparkles };
}

export interface StarFieldProps {
  density?: keyof typeof DENSITY;
  seed?: number;
  className?: string;
}

/**
 * Decorative night sky (pure SVG, no JS). Place inside a `relative` parent; it fills it.
 * Twinkling stops automatically with prefers-reduced-motion.
 */
export function StarField({ density = "medium", seed = 7, className }: StarFieldProps) {
  const { stars, sparkles } = makeStars(DENSITY[density], seed);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <g>
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.gold ? "#E9C77B" : "#FBF7EF"}
            opacity={s.o}
            className={s.twinkle ? "animate-twinkle" : undefined}
            style={s.twinkle ? { animationDelay: `${s.delay}s` } : undefined}
          />
        ))}
      </g>
      <g fill="#E9C77B">
        {sparkles.map((p, i) => (
          <path
            key={i}
            className="animate-twinkle"
            style={{ animationDelay: `${p.delay}s` }}
            transform={`translate(${p.x} ${p.y}) scale(${p.s / 12})`}
            d="M0-12 1.6-1.6 12 0 1.6 1.6 0 12-1.6 1.6-12 0-1.6-1.6Z"
          />
        ))}
      </g>
    </svg>
  );
}
