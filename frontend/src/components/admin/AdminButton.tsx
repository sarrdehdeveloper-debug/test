import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export type AdminButtonVariant =
  "primary" | "gold" | "secondary" | "ghost" | "danger" | "dangerGhost";
export type AdminButtonSize = "xs" | "sm" | "md";

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const VARIANTS: Record<AdminButtonVariant, string> = {
  /** Navy: the default action of a page or form. */
  primary: "bg-night text-ivory shadow-sm hover:bg-night-3 active:bg-night-2",
  /** Gold: the single most important call to action (sign in, publish). */
  gold: "bg-gold-soft-gradient text-night shadow-[0_6px_16px_-8px_rgb(199_137_51/0.8)] hover:brightness-105",
  secondary:
    "border border-stone-300 bg-white text-ink shadow-xs hover:border-stone-400 hover:bg-stone-50 active:bg-stone-100",
  ghost: "text-ink-soft hover:bg-stone-100 hover:text-ink",
  danger: "bg-danger text-white shadow-sm hover:bg-[#9a2019]",
  dangerGhost: "text-danger hover:bg-danger-soft",
};

const SIZES: Record<AdminButtonSize, string> = {
  xs: "h-7 px-2 text-xs",
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
};

const ICON_ONLY: Record<AdminButtonSize, string> = {
  xs: "size-7",
  sm: "size-8",
  md: "size-10",
};

interface CommonProps {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  /** Icon before the label. */
  icon?: IconName;
  /** Icon after the label. */
  iconEnd?: IconName;
  /** Square button showing only `icon`; `children` becomes the accessible name (sr-only). */
  iconOnly?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export function adminButtonClasses({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  fullWidth = false,
  className,
}: Pick<CommonProps, "variant" | "size" | "iconOnly" | "fullWidth" | "className"> = {}) {
  return cn(
    BASE,
    VARIANTS[variant],
    iconOnly ? cn(ICON_ONLY[size], "px-0") : SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

function Content({ icon, iconEnd, iconOnly, loading, size, children }: CommonProps) {
  const iconClass = size === "xs" ? "size-3.5" : "size-4";
  return (
    <>
      {loading ? (
        <Spinner size="sm" className={iconClass} />
      ) : icon ? (
        <Icon name={icon} className={iconClass} />
      ) : null}
      {iconOnly ? <span className="sr-only">{children}</span> : <span>{children}</span>}
      {iconEnd && !iconOnly ? <Icon name={iconEnd} className={iconClass} /> : null}
    </>
  );
}

export type AdminButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps>;

/**
 * Dashboard button (default `variant="secondary"`, `type="button"`).
 *   <AdminButton variant="primary" type="submit" loading={save.pending}>Save</AdminButton>
 *   <AdminButton icon="trash" iconOnly variant="ghost" onClick={…}>Delete offer</AdminButton>
 */
export function AdminButton({
  variant,
  size = "md",
  icon,
  iconEnd,
  iconOnly,
  loading,
  fullWidth,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: AdminButtonProps) {
  return (
    <button
      type={type}
      className={adminButtonClasses({ variant, size, iconOnly, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={iconOnly && typeof children === "string" ? children : rest.title}
      {...rest}
    >
      <Content icon={icon} iconEnd={iconEnd} iconOnly={iconOnly} loading={loading} size={size}>
        {children}
      </Content>
    </button>
  );
}

export type AdminButtonLinkProps = Omit<CommonProps, "loading"> &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps | "href"> & {
    href: string;
    /** Open in a new tab (adds rel="noopener noreferrer"). */
    external?: boolean;
  };

/** Link styled as a button (next/link; `external` opens a new tab). */
export function AdminButtonLink({
  href,
  variant,
  size = "md",
  icon,
  iconEnd,
  iconOnly,
  fullWidth,
  className,
  children,
  external,
  ...rest
}: AdminButtonLinkProps) {
  const classes = adminButtonClasses({ variant, size, iconOnly, fullWidth, className });
  const content = (
    <Content icon={icon} iconEnd={iconEnd} iconOnly={iconOnly} size={size}>
      {children}
    </Content>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {content}
    </Link>
  );
}
