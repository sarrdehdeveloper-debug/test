import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FlowMessages } from "@/components/flows/FlowMessages";
import { ReportLanding } from "@/components/flows/report/ReportLanding";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { getPublicConfig } from "@/lib/public-config";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/report/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("report");
  return pageMetadata({ locale, path: "/report", title: t("metaTitle"), noIndex: true });
}

/** Landing page of the emailed download link (`/report/{id}#t=<token>`). */
export default async function ReportPage({ params }: PageProps<"/[locale]/report/[id]">) {
  const { locale, id } = await params;
  const [c, config] = await Promise.all([getSiteContent(locale), getPublicConfig()]);
  return (
    <FlowMessages namespaces={["report"]}>
      <ReportLanding
        orderId={id}
        contactEmail={c.t("company.email")}
        accessHours={config.report_access_hours}
      />
    </FlowMessages>
  );
}
