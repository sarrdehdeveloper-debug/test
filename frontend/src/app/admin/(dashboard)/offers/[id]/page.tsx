import type { Metadata } from "next";
import { OfferEditor } from "@/components/admin/offers/OfferEditor";

export async function generateMetadata({
  params,
}: PageProps<"/admin/offers/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New offer" : "Edit offer" };
}

/** /admin/offers/new and /admin/offers/[id] — create or edit an offer (editors and up). */
export default async function OfferEditorPage({ params }: PageProps<"/admin/offers/[id]">) {
  const { id } = await params;
  return <OfferEditor id={id} />;
}
