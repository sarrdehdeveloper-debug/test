import type { Metadata } from "next";
import { LegalDocument, legalMetadata } from "@/components/pages/legal/LegalDocument";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata("terms", locale);
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  return <LegalDocument kind="terms" locale={locale} />;
}
