import { Sparkle } from "@/components/decor/Ornament";
import { Spinner } from "./Spinner";

export interface PageLoadingProps {
  /** Announced to screen readers (e.g. t("common.loading")). */
  label: string;
}

/**
 * Full-band loading state used by `loading.tsx` files while a page streams in.
 * Keeps roughly the height of a hero so the footer does not jump up and down.
 */
export function PageLoading({ label }: PageLoadingProps) {
  return (
    <section
      data-tone="ivory"
      aria-busy="true"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 bg-ivory px-4 py-24 text-center"
    >
      <span className="relative grid size-16 place-items-center rounded-full border border-gold/30 text-ink">
        <Spinner size="lg" label={label} />
      </span>
      <span aria-hidden="true" className="flex items-center gap-2 text-gold/70">
        <Sparkle className="size-2.5" />
        <Sparkle className="size-3.5" />
        <Sparkle className="size-2.5" />
      </span>
    </section>
  );
}
