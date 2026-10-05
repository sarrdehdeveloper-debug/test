import Image from "next/image";
import { ANIMAL_CHARS, SIGN_GLYPHS } from "@/components/zodiac/data";
import { cn } from "@/lib/cn";
import { CHINESE_ANIMALS, WESTERN_SIGNS } from "@/lib/types";

const C = 300;
const round = (n: number) => Math.round(n * 100) / 100;

function polar(radius: number, degrees: number) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return { x: round(C + radius * Math.cos(rad)), y: round(C + radius * Math.sin(rad)) };
}

const TICKS = Array.from({ length: 72 }, (_, i) => {
  const angle = i * 5;
  const major = i % 6 === 0;
  return { a: polar(major ? 276 : 283, angle), b: polar(290, angle), major };
});

const SIGNS = WESTERN_SIGNS.map((sign, i) => ({ glyph: SIGN_GLYPHS[sign], angle: i * 30 + 15, ...polar(256, i * 30 + 15) }));
const ANIMALS = CHINESE_ANIMALS.map((animal, i) => ({ char: ANIMAL_CHARS[animal], angle: i * 30, ...polar(205, i * 30) }));
const DOTS = Array.from({ length: 12 }, (_, i) => polar(205, i * 30 + 15));

/**
 * Decorative astrolabe: an outer ring of the 12 Western glyphs and a counter-rotating inner ring of
 * the 12 Chinese animals around the brand emblem — the two traditions around one centre.
 */
export function ZodiacWheel({ className, priority = true }: { className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative aspect-square select-none", className)} aria-hidden="true">
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,rgb(199_137_51/0.35)_0%,rgb(199_137_51/0.08)_45%,transparent_70%)] blur-xl" />
      <svg viewBox="0 0 600 600" className="absolute inset-0 h-full w-full overflow-visible" focusable="false">
        <defs>
          <linearGradient id="zw-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E9C77B" />
            <stop offset="0.5" stopColor="#C78933" />
            <stop offset="1" stopColor="#A46F26" />
          </linearGradient>
        </defs>

        <g className="animate-orbit [transform-origin:300px_300px]">
          <circle cx={C} cy={C} r={291} fill="none" stroke="url(#zw-gold)" strokeWidth="1.4" />
          <circle cx={C} cy={C} r={226} fill="none" stroke="url(#zw-gold)" strokeWidth="1" strokeOpacity="0.8" />
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.a.x}
              y1={t.a.y}
              x2={t.b.x}
              y2={t.b.y}
              stroke="#C78933"
              strokeOpacity={t.major ? 0.9 : 0.45}
              strokeWidth={t.major ? 1.2 : 0.8}
            />
          ))}
          {Array.from({ length: 12 }, (_, i) => {
            const a = polar(229, i * 30);
            const b = polar(276, i * 30);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#C78933" strokeOpacity="0.35" strokeWidth="0.8" />;
          })}
          {SIGNS.map((s) => (
            <text
              key={s.angle}
              x={s.x}
              y={s.y}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${s.angle} ${s.x} ${s.y})`}
              fill="#E9C77B"
              fontSize="27"
              className="font-[family-name:var(--font-symbol)]"
            >
              {s.glyph}
            </text>
          ))}
        </g>

        <g className="animate-orbit-reverse [transform-origin:300px_300px]">
          <circle cx={C} cy={C} r={184} fill="none" stroke="#C78933" strokeOpacity="0.55" strokeWidth="0.8" strokeDasharray="2 6" />
          {ANIMALS.map((a) => (
            <text
              key={a.angle}
              x={a.x}
              y={a.y}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${a.angle} ${a.x} ${a.y})`}
              fill="#C78933"
              fontSize="25"
              fontWeight="600"
              className="font-[family-name:var(--font-cjk)]"
            >
              {a.char}
            </text>
          ))}
          {DOTS.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="1.8" fill="#E9C77B" fillOpacity="0.7" />
          ))}
        </g>
      </svg>
      <Image
        src="/brand/emblem.svg"
        alt=""
        width={530}
        height={530}
        priority={priority}
        className="absolute top-1/2 left-1/2 w-[56%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_28px_rgb(199_137_51/0.35)]"
      />
    </div>
  );
}
