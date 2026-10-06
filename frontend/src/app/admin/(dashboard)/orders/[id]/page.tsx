import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Order" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function OrderDetailPage() {
  return (
    <ComingSoon
      title="Order"
      description="Customer, chart, generated sections, report and payment events."
      icon="orders"
      breadcrumbs={[{ label: "Orders", href: "/admin/orders" }, { label: "Order" }]}
    />
  );
}
