import type { Metadata } from "next";
import { LegalDocument, legalMetadata } from "@/components/pages/legal/LegalDocument";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata("privacy", locale);
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  return <LegalDocument kind="privacy" locale={locale} />;
}
