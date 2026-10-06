import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Prompts" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function PromptsPage() {
  return (
    <ComingSoon
      title="Prompts"
      description="The six versioned AI prompts that write the paid report."
      icon="prompts"
    />
  );
}
