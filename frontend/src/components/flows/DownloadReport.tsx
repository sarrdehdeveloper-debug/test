"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { downloadProblem, type DownloadProblem } from "@/lib/flows/errors";
import { fetchReport, saveBlob } from "@/lib/flows/report";
import { cn } from "@/lib/cn";

/** Problems the parent view handles itself (different page state rather than an inline error). */
export type DownloadOutcome = Extract<DownloadProblem, "invalidLink" | "notReady" | "expired">;

export interface DownloadReportProps {
  orderId: string;
  /** Browser access token or email-link token (sent as `Authorization: Bearer`). */
  token: string;
  onProblem?: (problem: DownloadOutcome) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

type State = "idle" | "preparing" | "done";

/**
 * "Download your report": fetches the PDF with the token in a header (never in a URL), then saves
 * it through an object URL. Status is announced politely; errors inline.
 */
export function DownloadReport({
  orderId,
  token,
  onProblem,
  variant = "primary",
  size = "lg",
  className,
}: DownloadReportProps) {
  const t = useTranslations("flows.download");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<DownloadProblem | null>(null);

  async function download() {
    if (state === "preparing") return;
    setState("preparing");
    setError(null);
    try {
      const blob = await fetchReport(orderId, token);
      saveBlob(blob);
      setState("done");
    } catch (err) {
      setState("idle");
      const problem = downloadProblem(err);
      if (
        onProblem &&
        (problem === "invalidLink" || problem === "notReady" || problem === "expired")
      ) {
        onProblem(problem);
      } else {
        setError(problem);
      }
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <Button
        variant={variant}
        size={size}
        onClick={download}
        loading={state === "preparing"}
        icon={<DownloadIcon />}
        className="max-sm:w-full"
      >
        {state === "preparing" ? t("preparing") : state === "done" ? t("again") : t("button")}
      </Button>
      <p role="status" className="min-h-5 text-center text-sm text-muted">
        {state === "done" ? t("started") : state === "idle" && !error ? t("fileInfo") : ""}
      </p>
      {error ? (
        <Alert tone="error" className="w-full max-w-md text-start">
          {error === "rateLimited" ? t("rateLimited") : t("failed")}
        </Alert>
      ) : null}
    </div>
  );
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-[1.1rem] shrink-0", className)}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3v9.5m0 0 3.8-3.8M10 12.5 6.2 8.7M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5" />
    </svg>
  );
}
