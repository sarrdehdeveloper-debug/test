"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Ornament } from "@/components/decor/Ornament";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { parseReportToken } from "@/lib/flows/report";
import { ContactLine } from "../ContactLine";
import { DownloadReport, type DownloadOutcome } from "../DownloadReport";
import { FlowHero, FlowSurface } from "../FlowHero";
import { StatusCard } from "../StatusCard";

/**
 * The email-link token is read ONCE per report path from `#t=…` and kept in memory only; the
 * fragment is then removed from the address bar (and history) so it is not bookmarked, shared in a
 * screenshot or synced. Module scope keeps it across Strict Mode re-renders.
 */
let captured: { path: string; token: string | null } | null = null;

function captureToken(): string | null {
  // Locale-agnostic key: switching the language (/ar/report/x -> /en/report/x) keeps the token.
  const path = window.location.pathname.replace(/^\/[^/]+(?=\/report\/)/, "");
  const fromHash = parseReportToken(window.location.hash);
  // A new page, or another email link opened in this tab (same path, new fragment).
  if (!captured || captured.path !== path || (fromHash && fromHash !== captured.token)) {
    captured = { path, token: fromHash };
  }
  return captured.token;
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export interface ReportLandingProps {
  orderId: string;
  contactEmail: string;
  accessHours: number;
}

export function ReportLanding(props: ReportLandingProps) {
  // undefined during SSR / hydration, then the token or null.
  const token = useSyncExternalStore<string | null | undefined>(
    subscribeHash,
    captureToken,
    () => undefined,
  );

  useEffect(() => {
    if (token === undefined || !window.location.hash) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
  }, [token]);

  // A new token (another email link) starts from a clean state.
  return <ReportView key={token ?? String(token)} token={token} {...props} />;
}

function ReportView({
  orderId,
  contactEmail,
  accessHours,
  token,
}: ReportLandingProps & { token: string | null | undefined }) {
  const t = useTranslations("report");
  const tc = useTranslations("common");
  const [problem, setProblem] = useState<DownloadOutcome | null>(null);

  if (token === undefined) {
    return (
      <>
        <FlowHero overlap eyebrow={t("eyebrow")} title={t.rich("title", { brand })} />
        <FlowSurface>
          <div
            aria-busy="true"
            className="mx-auto grid min-h-64 max-w-2xl place-items-center rounded-2xl border border-line bg-card shadow-lift"
          >
            <Spinner size="lg" label={t("checking")} />
          </div>
        </FlowSurface>
      </>
    );
  }

  const footer = <ContactLine email={contactEmail} />;
  if (token === null || problem) {
    const kind = token === null ? "missing" : problem;
    const content = {
      missing: { title: t("missing.title"), body: t("missing.body"), tone: "warning" as const },
      invalidLink: { title: t("invalid.title"), body: t("invalid.body"), tone: "warning" as const },
      notReady: { title: t("notReady.title"), body: t("notReady.body"), tone: "neutral" as const },
      expired: {
        title: t("expired.title"),
        body: t("expired.body", { hours: accessHours }),
        tone: "neutral" as const,
      },
    }[kind ?? "missing"];
    return (
      <>
        <FlowHero overlap eyebrow={t("eyebrow")} title={content.title} />
        <FlowSurface>
          <StatusCard
            tone={content.tone}
            footer={footer}
            actions={
              kind === "notReady" ? (
                <>
                  <Button href={`/order/${encodeURIComponent(orderId)}`} icon={<ArrowIcon />}>
                    {t("notReady.orderLink")}
                  </Button>
                  <Button variant="outline" onClick={() => setProblem(null)}>
                    {tc("tryAgain")}
                  </Button>
                </>
              ) : kind === "expired" ? (
                <Button href="/reading" icon={<ArrowIcon />}>
                  {t("newReport")}
                </Button>
              ) : null
            }
          >
            {content.body}
          </StatusCard>
        </FlowSurface>
      </>
    );
  }

  return (
    <>
      <FlowHero
        overlap
        eyebrow={t("eyebrow")}
        title={t.rich("title", { brand })}
        lead={t("lead")}
      />
      <FlowSurface>
        <Card
          padding="none"
          className="mx-auto max-w-2xl px-6 py-10 text-center shadow-lift sm:px-12"
        >
          <ReportIllustration />
          <Ornament className="mx-auto mt-6 h-4 w-36 text-ornament" />
          <DownloadReport orderId={orderId} token={token} onProblem={setProblem} className="mt-7" />
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            {t("privacyNote")}
          </p>
          <div className="mt-8 border-t border-line pt-6">{footer}</div>
        </Card>
      </FlowSurface>
    </>
  );
}

/** The brand name keeps its Latin typeface inside Arabic text. */
const brand = (chunks: ReactNode) => (
  // The class re-resolves the font variables that `[lang="en"]` overrides in Arabic pages.
  <span lang="en" className="font-serif">
    {chunks}
  </span>
);

/** A small gold "document" emblem. */
function ReportIllustration() {
  return (
    <svg
      viewBox="0 0 96 112"
      aria-hidden="true"
      className="mx-auto h-24 w-auto drop-shadow-[0_10px_24px_rgb(199_137_51/0.35)]"
    >
      <defs>
        <linearGradient id="zb-doc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F1D696" />
          <stop offset="0.55" stopColor="#E2B866" />
          <stop offset="1" stopColor="#C78933" />
        </linearGradient>
      </defs>
      <path d="M14 4h48l22 22v78a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" fill="#0E1726" />
      <path d="M62 4v18a4 4 0 0 0 4 4h18" fill="none" stroke="url(#zb-doc)" strokeWidth="2" />
      <path
        d="M14 4h48l22 22v78a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"
        fill="none"
        stroke="url(#zb-doc)"
        strokeWidth="2"
      />
      <circle cx="47" cy="56" r="17" fill="none" stroke="url(#zb-doc)" strokeWidth="1.5" />
      <path
        d="M47 43l2.4 10.6L60 56l-10.6 2.4L47 69l-2.4-10.6L34 56l10.6-2.4Z"
        fill="url(#zb-doc)"
      />
      <path
        d="M26 84h42M30 92h34"
        stroke="#E9C77B"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
