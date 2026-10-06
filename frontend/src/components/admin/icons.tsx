import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";
import type { AdminIconName } from "@/lib/admin/nav";

/**
 * Line icons of the dashboard (20×20 grid, currentColor stroke). Decorative by default
 * (`aria-hidden`); give the parent control an accessible name.
 *   <Icon name="orders" className="size-5" />
 */

export type IconName =
  | AdminIconName
  | "menu"
  | "close"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "external"
  | "logout"
  | "check"
  | "copy"
  | "search"
  | "upload"
  | "trash"
  | "refresh"
  | "alert"
  | "info"
  | "plus"
  | "eye"
  | "lock"
  | "shield"
  | "bold"
  | "italic"
  | "heading"
  | "list"
  | "listOrdered"
  | "link"
  | "quote"
  | "image"
  | "calendar"
  | "sparkle"
  | "arrowRight"
  | "filter";

const PATHS: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="6" height="7" rx="1.5" />
      <rect x="11" y="3" width="6" height="4" rx="1.5" />
      <rect x="11" y="9" width="6" height="8" rx="1.5" />
      <rect x="3" y="12" width="6" height="5" rx="1.5" />
    </>
  ),
  orders: (
    <>
      <path d="M5 2.75h10a1 1 0 0 1 1 1V17.5l-2.25-1.25L11.5 17.5 10 16.25 8.5 17.5l-2.25-1.25L4 17.5V3.75a1 1 0 0 1 1-1Z" />
      <path d="M7 7h6M7 10h6M7 13h3" />
    </>
  ),
  discounts: (
    <>
      <path d="M10.6 2.75H16a1.25 1.25 0 0 1 1.25 1.25v5.4a1.25 1.25 0 0 1-.37.88l-6.5 6.5a1.25 1.25 0 0 1-1.76 0l-5.4-5.4a1.25 1.25 0 0 1 0-1.76l6.5-6.5a1.25 1.25 0 0 1 .88-.37Z" />
      <circle cx="13.5" cy="6.5" r="1.1" />
    </>
  ),
  content: (
    <>
      <path d="M5 2.75h6.5l3.5 3.5V17a.25.25 0 0 1-.25.25H5A.75.75 0 0 1 4.25 16.5v-13A.75.75 0 0 1 5 2.75Z" />
      <path d="M11.25 2.75v3.75H15M7 10h6M7 13h6" />
    </>
  ),
  readings: (
    <>
      <path d="M10 2.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L10 11.7l-3.7 2.4 1.1-4.3L4 7l4.4-.3L10 2.5Z" />
      <path d="M4 17.25h12" />
    </>
  ),
  offers: (
    <>
      <rect x="3" y="7" width="14" height="4" rx="1" />
      <path d="M4.5 11v5.25a.75.75 0 0 0 .75.75h9.5a.75.75 0 0 0 .75-.75V11M10 7v10M10 7c-1.5-3.5-5-3.5-5-1.5S8 7 10 7Zm0 0c1.5-3.5 5-3.5 5-1.5S12 7 10 7Z" />
    </>
  ),
  library: (
    <>
      <path d="M3.5 4.25c2.5-.9 4.6-.6 6.5.9v11c-1.9-1.5-4-1.8-6.5-.9v-11ZM16.5 4.25c-2.5-.9-4.6-.6-6.5.9v11c1.9-1.5 4-1.8 6.5-.9v-11Z" />
    </>
  ),
  blog: (
    <>
      <path d="M13.9 3.4a1.8 1.8 0 0 1 2.6 2.6L7.4 15.1l-3.4.9.9-3.4 9-9.2Z" />
      <path d="M12.5 4.9l2.6 2.6M10 17h6" />
    </>
  ),
  media: (
    <>
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.75" />
      <circle cx="7.25" cy="8" r="1.5" />
      <path d="m3 14.5 4-4 3 3 2.5-2.5 4.5 4.5" />
    </>
  ),
  image: (
    <>
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.75" />
      <circle cx="7.25" cy="8" r="1.5" />
      <path d="m3 14.5 4-4 3 3 2.5-2.5 4.5 4.5" />
    </>
  ),
  prompts: (
    <>
      <path d="M3.5 16.5 12 8M10.5 6.5l3 3" />
      <path d="M14.5 2.5v3M13 4h3M16.5 9v2M15.5 10h2M7 3v2M6 4h2" />
    </>
  ),
  jobs: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 5.75V10l2.75 1.75" />
    </>
  ),
  settings: (
    <>
      <path d="M3 5.5h8M14.5 5.5H17M3 10h2.5M9 10h8M3 14.5h6M12.5 14.5H17" />
      <circle cx="12.75" cy="5.5" r="1.75" />
      <circle cx="7.25" cy="10" r="1.75" />
      <circle cx="10.75" cy="14.5" r="1.75" />
    </>
  ),
  users: (
    <>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.75 16.25c.5-2.6 2.4-4 4.75-4s4.25 1.4 4.75 4" />
      <path d="M12.75 4.6a2.6 2.6 0 0 1 0 4.8M14.25 12.4c1.5.5 2.6 1.7 3 3.85" />
    </>
  ),
  audit: (
    <>
      <path d="M10 2.5 16 5v4.5c0 3.9-2.6 6.6-6 8-3.4-1.4-6-4.1-6-8V5l6-2.5Z" />
      <path d="M7 10h6M7 7.5h6M7 12.5h3.5" />
    </>
  ),
  account: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <circle cx="10" cy="8.25" r="2.5" />
      <path d="M5.5 15.4c1-1.75 2.6-2.65 4.5-2.65s3.5.9 4.5 2.65" />
    </>
  ),
  menu: <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  chevronDown: <path d="m5.5 8 4.5 4.5L14.5 8" />,
  chevronLeft: <path d="M12 5.5 7.5 10l4.5 4.5" />,
  chevronRight: <path d="m8 5.5 4.5 4.5L8 14.5" />,
  external: (
    <path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5M14.5 11.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4" />
  ),
  logout: (
    <>
      <path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 16.5h3" />
      <path d="M12.5 6.5 16 10l-3.5 3.5M16 10H8" />
    </>
  ),
  check: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v6.5A1.5 1.5 0 0 0 5 13h2" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5.25" />
      <path d="m13 13 3.5 3.5" />
    </>
  ),
  upload: (
    <>
      <path d="M10 13V3.5M6 7.5l4-4 4 4" />
      <path d="M3.5 13v2.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 9v4.5M11.5 9v4.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M16 10a6 6 0 1 1-1.8-4.3" />
      <path d="M16 3.5v3.5h-3.5" />
    </>
  ),
  alert: (
    <>
      <path d="M10 7v4m0 3h.01" />
      <path d="M8.6 3.3 1.9 15a1.6 1.6 0 0 0 1.4 2.4h13.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9v4.5M10 6.5h.01" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  eye: (
    <>
      <path d="M1.75 10S4.75 4.5 10 4.5 18.25 10 18.25 10 15.25 15.5 10 15.5 1.75 10 1.75 10Z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="8.5" width="12" height="8.5" rx="1.75" />
      <path d="M6.75 8.5V6.25a3.25 3.25 0 0 1 6.5 0V8.5" />
    </>
  ),
  shield: (
    <>
      <path d="M10 2.5 16 5v4.5c0 3.9-2.6 6.6-6 8-3.4-1.4-6-4.1-6-8V5l6-2.5Z" />
      <path d="m7.25 10 2 2 3.5-4" />
    </>
  ),
  bold: <path d="M6 4h4.75a3 3 0 0 1 0 6H6V4Zm0 6h5.5a3 3 0 0 1 0 6H6v-6Z" />,
  italic: <path d="M8.5 4h6M5.5 16h6M11.5 4 8.5 16" />,
  heading: <path d="M5 4v12M15 4v12M5 10h10" />,
  list: (
    <>
      <path d="M8 5.5h8.5M8 10h8.5M8 14.5h8.5" />
      <circle cx="4.25" cy="5.5" r=".9" fill="currentColor" />
      <circle cx="4.25" cy="10" r=".9" fill="currentColor" />
      <circle cx="4.25" cy="14.5" r=".9" fill="currentColor" />
    </>
  ),
  listOrdered: (
    <>
      <path d="M8.5 5.5h8M8.5 10h8M8.5 14.5h8" />
      <path d="M3.5 4.25 4.75 3.5v4M3.5 9.25c.3-.6 2-.9 2 .35 0 .9-2 1.7-2 2.9h2.1M3.5 13.5h2l-1 1.25c.9 0 1.25.5 1.25 1s-.6 1-1.25 1-.9-.25-1.1-.5" />
    </>
  ),
  link: (
    <>
      <path d="M8.5 11.5a3.25 3.25 0 0 0 4.6 0l2.65-2.65a3.25 3.25 0 0 0-4.6-4.6L10.1 5.3" />
      <path d="M11.5 8.5a3.25 3.25 0 0 0-4.6 0L4.25 11.15a3.25 3.25 0 0 0 4.6 4.6l1.05-1.05" />
    </>
  ),
  quote: (
    <path d="M4 9.5h3.5v4.5H4V9.5Zm0 0C4 7 5 5.5 7.5 5M11.5 9.5H15v4.5h-3.5V9.5Zm0 0c0-2.5 1-4 3.5-4.5" />
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="1.75" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </>
  ),
  sparkle: (
    <path d="M10 2.5c.6 3.7 2.3 5.4 6 6-3.7.6-5.4 2.3-6 6-.6-3.7-2.3-5.4-6-6 3.7-.6 5.4-2.3 6-6Z" />
  ),
  arrowRight: <path d="M4 10h11m-4-4.5L15.5 10 11 14.5" />,
  filter: <path d="M3.5 4.5h13l-5 6v4.5l-3 1.5v-6l-5-6Z" />,
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Accessible name; when omitted the icon is decorative (aria-hidden). */
  label?: string;
}

export function Icon({ name, label, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", className)}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
