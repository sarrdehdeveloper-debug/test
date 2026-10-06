import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Blog post" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function BlogPostPage() {
  return (
    <ComingSoon
      title="Blog post"
      description="Edit the article, its translations and SEO."
      icon="blog"
      breadcrumbs={[{ label: "Blog", href: "/admin/blog" }, { label: "Blog post" }]}
    />
  );
}
