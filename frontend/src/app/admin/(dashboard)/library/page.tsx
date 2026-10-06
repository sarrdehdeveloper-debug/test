import type { Metadata } from "next";
import { LibraryView } from "./LibraryView";

export const metadata: Metadata = { title: "Galaxy Library" };

/** /admin/library — book series and books of the Galaxy Library (editors and up). */
export default function LibraryPage() {
  return <LibraryView />;
}
