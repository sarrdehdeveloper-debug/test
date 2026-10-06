import type { ReactNode } from "react";
import type { Messages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { pickClientMessages } from "@/i18n/client-messages";

/** Namespaces of messages/<locale>/flows.json. */
export type FlowNamespace = "flows" | "free" | "reading" | "checkout" | "order" | "report";

/**
 * Sends the flow namespaces to the browser ONLY on the pages that need them (instead of adding
 * them to CLIENT_NAMESPACES, which would ship ~15 KB of strings with every page). Nested providers
 * do not merge messages, so the global client namespaces are passed along too (they compress away
 * in the same document). `flows` (shared download / contact strings) is always included.
 *
 *   <FlowMessages namespaces={["free"]}><FreeReadingFlow ... /></FlowMessages>
 */
export async function FlowMessages({
  namespaces,
  children,
}: {
  namespaces: readonly Exclude<FlowNamespace, "flows">[];
  children: ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const scoped: Record<string, unknown> = { ...pickClientMessages(messages) };
  for (const ns of ["flows", ...namespaces] as const) scoped[ns] = messages[ns];
  return (
    <NextIntlClientProvider locale={locale} messages={scoped as Partial<Messages>}>
      {children}
    </NextIntlClientProvider>
  );
}
