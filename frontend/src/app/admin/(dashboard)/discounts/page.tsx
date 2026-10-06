import type { Metadata } from "next";
import { DiscountsView } from "./DiscountsView";

export const metadata: Metadata = { title: "Discounts" };

/** /admin/discounts — discount codes (managers; editors get the "no permission" state). */
export default function DiscountsPage() {
  return <DiscountsView />;
}
