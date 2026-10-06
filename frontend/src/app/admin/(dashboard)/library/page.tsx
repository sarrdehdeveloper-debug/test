import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Galaxy Library" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function LibraryPage() {
  return (
    <ComingSoon
      title="Galaxy Library"
      description="Book series and books of the Galaxy Library."
      icon="library"
    />
  );
}
