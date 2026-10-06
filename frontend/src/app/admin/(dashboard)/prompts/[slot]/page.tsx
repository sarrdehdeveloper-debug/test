import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Prompt slot" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function PromptSlotPage() {
  return (
    <ComingSoon
      title="Prompt slot"
      description="Draft, preview, test and publish versions of this prompt."
      icon="prompts"
      breadcrumbs={[{ label: "Prompts", href: "/admin/prompts" }, { label: "Prompt slot" }]}
    />
  );
}
