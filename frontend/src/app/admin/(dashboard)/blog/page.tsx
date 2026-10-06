import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Blog" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function BlogPage() {
  return (
    <ComingSoon
      title="Blog"
      description="Articles in English and Arabic: drafts, scheduling and publishing."
      icon="blog"
    />
  );
}
