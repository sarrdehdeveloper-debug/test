/**
 * Join class names, skipping falsy values. There is no tailwind-merge: components expose variant
 * props for their look; pass `className` for layout concerns (margins, width, grid placement).
 *
 * Caveat: with no merging, a passed class only wins over a component's own class for the same CSS
 * property if Tailwind emits it later. Use variants to override display, e.g. hide a <Button>
 * (base `inline-flex`) with `max-md:hidden`, not `hidden md:inline-flex`.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
