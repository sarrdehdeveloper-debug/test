import { getTranslations } from "next-intl/server";

/** First focusable element: jumps to <main id="main">. */
export async function SkipLink() {
  const t = await getTranslations("nav");
  return (
    <a
      href="#main"
      className="sr-only rounded-full bg-gold-light px-5 py-2.5 font-semibold text-night focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-50"
    >
      {t("skipToContent")}
    </a>
  );
}
