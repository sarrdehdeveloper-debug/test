import type { Metadata } from "next";
import { OffersView } from "./OffersView";

export const metadata: Metadata = { title: "Offers" };

/** /admin/offers — list of promotions (editors and up); editing lives at /admin/offers/[id]. */
export default function OffersPage() {
  return <OffersView />;
}
