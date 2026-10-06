import type { Metadata } from "next";
import { SiteContentView } from "./SiteContentView";

export const metadata: Metadata = { title: "Site content" };

/** /admin/content — editable copy of the public site (editors and up). */
export default function SiteContentPage() {
  return <SiteContentView />;
}
