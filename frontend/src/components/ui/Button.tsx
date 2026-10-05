import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { isExternalUrl } from "@/lib/format";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap " +
  "transition-[transform,box-shadow,background-color,color,border-color] duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-3 " +
  "disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  // Night text on light gold keeps >= 4.5:1 contrast on any surface.
  primary:
    "bg-gold-soft-gradient text-night shadow-[0_8px_24px_-10px_rgb(199_137_51/0.75)] " +
    "hover:-translate-y-px hover:shadow-[0_12px_30px_-10px_rgb(199_137_51/0.9)] active:translate-y-0",
  // Inherits the surface text colour (ivory on night, ink on light).
  outline:
    "border border-gold-bright/70 text-fg bg-transparent hover:border-gold-light hover:bg-gold-light/10",
  ghost: "text-accent underline-offset-4 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-[0.95rem]",
  lg: "h-13 px-8 text-base",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Icon placed after the label (mirrored arrows: add `rtl:-scale-x-100` to the icon). */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

type AsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & { href?: undefined };

type AsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps | "href"> & {
    /** Internal hrefs are locale-less ("/free"); external URLs open as plain links. */
    href: string;
    prefetch?: boolean;
  };

export type ButtonProps = AsButton | AsLink;

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: Pick<CommonProps, "variant" | "size" | "fullWidth" | "className"> = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className);
}

/**
 * Brand button. Renders a locale-aware <Link> when `href` is set, otherwise a <button>.
 *   <Button href="/free">Free reading</Button>
 *   <Button variant="outline" type="submit" loading={pending}>Send</Button>
 */
export function Button(props: ButtonProps) {
  const { variant, size, fullWidth, loading, icon, className, children } = props;
  const classes = buttonClasses({ variant, size, fullWidth, className });
  const content = (
    <>
      {loading ? <Spinner size="sm" /> : null}
      <span>{children}</span>
      {icon && !loading ? icon : null}
    </>
  );

  if (props.href !== undefined) {
    const {
      href,
      variant: _v,
      size: _s,
      fullWidth: _f,
      loading: _l,
      icon: _i,
      className: _c,
      children: _ch,
      prefetch,
      ...rest
    } = props;
    void [_v, _s, _f, _l, _i, _c, _ch];
    if (isExternalUrl(href)) {
      return (
        <a href={href} className={classes} {...rest}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    fullWidth: _f,
    loading: _l,
    icon: _i,
    className: _c,
    children: _ch,
    type = "button",
    disabled,
    ...rest
  } = props;
  void [_v, _s, _f, _l, _i, _c, _ch];
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}

/** Small right-pointing arrow that mirrors in RTL. */
export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn("size-4 shrink-0 rtl:-scale-x-100", className)}
    >
      <path d="M4 10h11m-4-4.5L15.5 10 11 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
