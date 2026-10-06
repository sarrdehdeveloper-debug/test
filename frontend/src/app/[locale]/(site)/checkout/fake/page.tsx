import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FakeCheckout } from "@/components/flows/checkout/FakeCheckout";
import { FlowHero, FlowSurface } from "@/components/flows/FlowHero";
import { FlowMessages } from "@/components/flows/FlowMessages";
import { pageMetadata } from "@/lib/metadata";
import { getPublicConfig } from "@/lib/public-config";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/checkout/fake">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("checkout");
  return pageMetadata({ locale, path: "/checkout/fake", title: t("metaTitle"), noIndex: true });
}

/** Test checkout of the `fake` payment provider (development only). */
export default async function FakeCheckoutPage() {
  const [config, t] = await Promise.all([getPublicConfig(), getTranslations("checkout")]);
  return (
    <>
      <FlowHero overlap headingId="checkout-title" eyebrow={t("eyebrow")} title={t("title")} />
      <FlowSurface>
        <FlowMessages namespaces={["checkout"]}>
          <FakeCheckout available={config.fromApi && config.payment_provider === "fake"} />
        </FlowMessages>
      </FlowSurface>
    </>
  );
}
