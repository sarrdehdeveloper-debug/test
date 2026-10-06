import type { Metadata } from "next";
import { OverviewView } from "./OverviewView";

export const metadata: Metadata = { title: "Overview" };

/** /admin — sales & system health for managers, a content welcome page for editors. */
export default function AdminOverviewPage() {
  return <OverviewView />;
}
