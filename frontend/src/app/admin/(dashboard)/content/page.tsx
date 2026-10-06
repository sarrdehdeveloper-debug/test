import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Site content" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function SiteContentPage() {
  return (
    <ComingSoon
      title="Site content"
      description="Headlines, texts and legal pages of the public site, in English and Arabic."
      icon="content"
    />
  );
}
