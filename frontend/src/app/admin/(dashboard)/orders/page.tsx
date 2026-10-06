import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Orders" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function OrdersPage() {
  return (
    <ComingSoon
      title="Orders"
      description="Paid reports, their payment and delivery status."
      icon="orders"
    />
  );
}
