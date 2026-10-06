"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { formatDate } from "@/lib/format";
import type { FieldIssue } from "@/lib/flows/validation";

/** `(issue) => localized message` for the validation issues of src/lib/flows/validation.ts. */
export function useIssueMessage() {
  const locale = useLocale();
  const tv = useTranslations("form.validation");
  const tf = useTranslations("flows");
  return useCallback(
    (issue: FieldIssue | undefined | null): string | undefined => {
      if (!issue) return undefined;
      switch (issue.key) {
        case "emailMismatch":
          return tf("emailMismatch");
        case "dateRange":
          return tv("dateRange", {
            min: formatDate(String(issue.values?.min ?? ""), locale),
            max: formatDate(String(issue.values?.max ?? ""), locale),
          });
        case "tooLong":
          return tv("tooLong", { max: Number(issue.values?.max ?? 0) });
        default:
          return tv(issue.key);
      }
    },
    [locale, tf, tv],
  );
}
