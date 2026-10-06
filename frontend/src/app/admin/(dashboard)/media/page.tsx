import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Media" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function MediaPage() {
  return (
    <ComingSoon
      title="Media"
      description="Uploaded images used by offers, blog posts and the library."
      icon="media"
    />
  );
}
