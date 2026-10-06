import type { Metadata } from "next";
import { FreeReadingsView } from "./FreeReadingsView";

export const metadata: Metadata = { title: "Free readings" };

/** /admin/free-readings — the free plan's sign and animal readings (editors and up). */
export default function FreeReadingsPage() {
  return <FreeReadingsView />;
}
