import { useTranslations } from "next-intl";
import { PageLoading } from "@/components/ui/PageLoading";

/**
 * Shown while a page of the (site) group streams in (client navigations to dynamic pages).
 * Public pages live in this route group; the catch-all `[...rest]` stays outside it so unknown
 * URLs are not streamed and still get a real 404 status.
 */
export default function Loading() {
  const t = useTranslations("common");
  return <PageLoading label={t("loading")} />;
}
