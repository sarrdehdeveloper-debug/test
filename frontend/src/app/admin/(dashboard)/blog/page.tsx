import type { Metadata } from "next";
import { BlogView } from "./BlogView";

export const metadata: Metadata = { title: "Blog" };

/** /admin/blog — list of posts (editors and up); editing lives at /admin/blog/[id]. */
export default function BlogPage() {
  return <BlogView />;
}
