import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Offers" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function OffersPage() {
  return (
    <ComingSoon
      title="Offers"
      description="Promotions, banners and their discount codes."
      icon="offers"
    />
  );
}
