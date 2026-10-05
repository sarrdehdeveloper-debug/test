import "../fonts";
import "../globals.css";

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { pickClientMessages } from "@/i18n/client-messages";
import { LOCALE_META, routing } from "@/i18n/routing";
import { OG_IMAGE } from "@/lib/metadata";
import { siteUrl } from "@/lib/site";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#0E1726",
  colorScheme: "light",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: safeLocale, namespace: "meta" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t("siteName"), template: `%s | ${t("siteName")}` },
    description: t("description"),
    applicationName: "Zodiac Blend",
    openGraph: {
      siteName: t("siteName"),
      type: "website",
      locale: LOCALE_META[safeLocale].og,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={LOCALE_META[locale].dir}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider locale={locale} messages={pickClientMessages(messages)}>
          <SkipLink />
          <Header />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
