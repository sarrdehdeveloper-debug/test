import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Not found" };

/** Unknown /admin/... paths render the dashboard's not-found page (inside the shell). */
export default function MissingAdminPage() {
  notFound();
}
