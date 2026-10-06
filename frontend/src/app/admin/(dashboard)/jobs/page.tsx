import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Jobs" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function JobsPage() {
  return (
    <ComingSoon
      title="Jobs"
      description="Background jobs of the worker: report generation, emails and clean-up."
      icon="jobs"
    />
  );
}
