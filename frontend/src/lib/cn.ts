/**
 * Join class names, skipping falsy values. There is no tailwind-merge: components expose variant
 * props for their look; pass `className` for layout concerns (margins, width, grid placement).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
