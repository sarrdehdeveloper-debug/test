import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FlowMessages } from "@/components/flows/FlowMessages";
import { OrderStatusView } from "@/components/flows/order/OrderStatusView";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { getPublicConfig } from "@/lib/public-config";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/order/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("order");
  // Private page: noindex; the order id is not repeated in canonical / hreflang URLs.
  return pageMetadata({ locale, path: "/order", title: t("metaTitle"), noIndex: true });
}

/** Order status (personal data is fetched on the client with the token from localStorage). */
export default async function OrderPage({ params }: PageProps<"/[locale]/order/[id]">) {
  const { locale, id } = await params;
  const [c, config] = await Promise.all([getSiteContent(locale), getPublicConfig()]);
  return (
    <FlowMessages namespaces={["order"]}>
      <OrderStatusView
        orderId={id}
        contactEmail={c.t("company.email")}
        accessHours={config.report_access_hours}
      />
    </FlowMessages>
  );
}
