import type { Messages } from "next-intl";

/**
 * Namespaces sent to the browser for Client Components (useTranslations in "use client" files).
 * Server-only copy (`content`, `home`, ...) stays on the server; pass it to client components as
 * props. Add a namespace here when a new client component needs it.
 */
export const CLIENT_NAMESPACES = [
  "meta",
  "nav",
  "common",
  "form",
  "errors",
  "zodiac",
  "orderStatus",
  "orderStatusDescription",
  "offers",
  "errorPage",
] as const satisfies readonly (keyof Messages)[];

export type ClientNamespace = (typeof CLIENT_NAMESPACES)[number];

export function pickClientMessages(messages: Messages): Pick<Messages, ClientNamespace> {
  const out = {} as Record<string, unknown>;
  for (const ns of CLIENT_NAMESPACES) out[ns] = messages[ns];
  return out as Pick<Messages, ClientNamespace>;
}
