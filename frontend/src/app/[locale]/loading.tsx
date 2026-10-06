import { useTranslations } from "next-intl";
import { PageLoading } from "@/components/ui/PageLoading";

/** Shown while a page below /[locale] streams in (client navigations to dynamic pages). */
export default function Loading() {
  const t = useTranslations("common");
  return <PageLoading label={t("loading")} />;
}
