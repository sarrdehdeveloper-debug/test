import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Audit log" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function AuditPage() {
  return (
    <ComingSoon
      title="Audit log"
      description="Every change made in the dashboard, by whom and when."
      icon="audit"
    />
  );
}
