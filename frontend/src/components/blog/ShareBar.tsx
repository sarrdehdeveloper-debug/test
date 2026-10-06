import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/pages/CopyButton";
import { shareLinks, type ShareNetwork } from "@/components/pages/helpers/seo";
import { cn } from "@/lib/cn";
import { NativeShareButton } from "./NativeShareButton";

const ICONS: Record<ShareNetwork, ReactNode> = {
  x: (
    <path
      fill="currentColor"
      stroke="none"
      d="M15.2 2.5h2.7l-5.9 6.8 7 9.2h-5.5l-4.3-5.6-4.9 5.6H1.6l6.3-7.2L1.2 2.5h5.6l3.9 5.2 4.5-5.2Zm-1 14.4h1.5L5.9 4H4.3l9.9 12.9Z"
    />
  ),
  facebook: (
    <path
      fill="currentColor"
      stroke="none"
      d="M11.2 18v-6.6h2.2l.35-2.6H11.2V7.2c0-.75.22-1.27 1.3-1.27h1.38V3.6a18 18 0 0 0-2-.1c-2 0-3.36 1.22-3.36 3.45v1.9H6.3v2.6h2.22V18h2.68Z"
    />
  ),
  whatsapp: (
    <>
      <path d="M3.5 16.5 4.6 13a7 7 0 1 1 2.6 2.5L3.5 16.5Z" />
      <path d="M8 7.2c.2 2 2.6 4.4 4.7 4.7l.8-1-1.6-.8-.6.6c-.8-.3-1.7-1.2-2-2l.6-.6-.8-1.6-1.1.7Z" />
    </>
  ),
  linkedin: (
    <>
      <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="2.5" />
      <path d="M6.5 8.75V14M6.5 6v.01M9.75 14V8.75m0 2.4a2.25 2.25 0 0 1 4.5 0V14" />
    </>
  ),
  email: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="m3 5.5 7 5.5 7-5.5" />
    </>
  ),
};

/**
 * "Share this article": copy link, the system share sheet (where supported) and plain share
 * links (no third-party scripts). `url` is the canonical absolute URL of the article.
 */
export async function ShareBar({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const [t, ts, tc] = await Promise.all([
    getTranslations("blogPage"),
    getTranslations("pagesShared"),
    getTranslations("common"),
  ]);
  const links = shareLinks(url, title);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="eyebrow">{t("share")}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <CopyButton
          variant="pill"
          label={t("copyLink")}
          copiedLabel={t("linkCopied")}
          failedLabel={ts("copyFailed")}
        />
        <ul className="flex flex-wrap items-center gap-2">
          {links.map(({ network, href }) => {
            const label =
              network === "email"
                ? t("shareByEmail")
                : t("shareOn", { network: t(`networks.${network}`) });
            const external = network !== "email";
            return (
              <li key={network}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  title={label}
                  className="grid size-10 place-items-center rounded-full border border-line text-fg transition-colors hover:border-ornament hover:bg-gold-light/10 hover:text-accent"
                >
                  <span className="sr-only">
                    {label}
                    {external ? ` ${tc("opensInNewTab")}` : null}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="size-[1.1rem]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {ICONS[network]}
                  </svg>
                </a>
              </li>
            );
          })}
        </ul>
        <NativeShareButton title={title} label={t("nativeShare")} />
      </div>
    </div>
  );
}
