import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Discounts" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function DiscountsPage() {
  return (
    <ComingSoon
      title="Discounts"
      description="Discount codes for the paid report."
      icon="discounts"
    />
  );
}
