import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation. ALWAYS import Link / redirect / usePathname / useRouter from here
 * (not from next/link or next/navigation) for public pages: hrefs are written without the locale
 * (`<Link href="/free">`) and the current locale is prefixed automatically.
 */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
