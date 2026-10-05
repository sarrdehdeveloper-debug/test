"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import {
  discountErrorReason,
  isApiError,
  localizedErrorCode,
  suggestedTime,
} from "./errors";

/**
 * Returns `(error) => localized message` for anything thrown by the client API helper.
 * Known codes map to messages under `errors.*`; unknown codes fall back to `errors.generic`.
 */
export function useApiErrorMessage() {
  const t = useTranslations("errors");
  return useCallback(
    (error: unknown): string => {
      if (!isApiError(error)) return t("generic");
      const reason = discountErrorReason(error);
      if (reason) return t(`discount.${reason}`);
      if (error.code === "nonexistent_local_time") {
        const time = suggestedTime(error);
        return time ? t("nonexistent_local_time", { time }) : t("generic");
      }
      if (error.status >= 500 && localizedErrorCode(error.code) === "generic") {
        return t("server_error");
      }
      return t(localizedErrorCode(error.code));
    },
    [t],
  );
}
