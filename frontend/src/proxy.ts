import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Next.js 16 "proxy" (formerly middleware): locale detection + redirect for public pages
 * (`/` -> `/en` or `/ar` from the NEXT_LOCALE cookie / Accept-Language).
 */
export default createMiddleware(routing);

export const config = {
  // Skip the API proxy (/api), the admin dashboard (/admin), Next internals and files with an extension.
  matcher: ["/((?!api|admin|_next|_vercel|.*\\..*).*)"],
};
