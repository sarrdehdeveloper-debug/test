import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Free readings" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function FreeReadingsPage() {
  return (
    <ComingSoon
      title="Free readings"
      description="The 12 sign and 12 animal readings of the free plan, per language."
      icon="readings"
    />
  );
}
