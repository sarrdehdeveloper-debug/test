import type { Metadata } from "next";
import { PostEditor } from "@/components/admin/blog/PostEditor";

export async function generateMetadata({
  params,
}: PageProps<"/admin/blog/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New blog post" : "Edit blog post" };
}

/** /admin/blog/new and /admin/blog/[id] — write, schedule and publish a post (editors and up). */
export default async function BlogPostPage({ params }: PageProps<"/admin/blog/[id]">) {
  const { id } = await params;
  return <PostEditor id={id} />;
}
