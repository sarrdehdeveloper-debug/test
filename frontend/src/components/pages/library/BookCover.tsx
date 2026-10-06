import { Ornament, Sparkle } from "@/components/decor/Ornament";
import { MediaImage } from "@/components/ui/MediaImage";
import { cn } from "@/lib/cn";

/**
 * Book or series cover (2:3). Uses the CMS image when there is one, otherwise draws a navy cloth
 * cover with a gold frame, the title and the series name, so the shelf never looks empty.
 * Decorative: the title is always shown as real text next to it.
 */
export function BookCover({
  src,
  title,
  imprint,
  sizes = "(min-width: 1024px) 240px, (min-width: 640px) 30vw, 60vw",
  eager = false,
  className,
}: {
  src: string | null;
  title: string;
  /** Small caps line at the bottom of a drawn cover (e.g. "Galaxy Library"). */
  imprint: string;
  sizes?: string;
  /** Above the fold: load eagerly with high priority (LCP). */
  eager?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-tone="night"
      className={cn(
        "@container relative aspect-[2/3] overflow-hidden rounded-s-[4px] rounded-e-xl bg-night-sky shadow-lift ring-1 ring-gold-light/25",
        className,
      )}
    >
      {src ? (
        <MediaImage
          src={src}
          alt=""
          fill
          sizes={sizes}
          {...(eager ? { loading: "eager", fetchPriority: "high" } : {})}
          className="object-cover"
        />
      ) : (
        <>
          <div className="absolute inset-3 rounded-sm border border-gold-light/40" />
          <div className="absolute inset-[1.15rem] rounded-sm border border-gold-light/15" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[6%] px-[16%] text-center">
            <span className="block aspect-square w-[14%] min-w-4 text-gold-light">
              <Sparkle className="size-full" />
            </span>
            <p className="line-clamp-4 font-serif text-[clamp(0.95rem,10cqi,1.65rem)] leading-tight font-semibold text-gold-light rtl:leading-snug">
              {title}
            </p>
            <Ornament className="h-3 w-[70%] text-gold-bright/80" />
          </div>
          <p className="absolute inset-x-0 bottom-[7%] line-clamp-2 px-[16%] text-center leading-snug font-display text-[clamp(0.5rem,4.2cqi,0.7rem)] tracking-[0.14em] text-gold-light/70 uppercase rtl:text-xs rtl:tracking-normal">
            {imprint}
          </p>
        </>
      )}
      {/* Spine shading on the binding side + a soft sheen. */}
      <div className="pointer-events-none absolute inset-y-0 start-0 w-[7%] bg-linear-to-r from-black/45 to-transparent rtl:bg-linear-to-l" />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/10 via-transparent to-transparent" />
    </div>
  );
}
