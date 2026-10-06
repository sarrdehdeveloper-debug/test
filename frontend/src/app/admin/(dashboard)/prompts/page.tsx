import type { Metadata } from "next";
import { PromptsView } from "./PromptsView";

export const metadata: Metadata = { title: "Prompts" };

export default function PromptsPage() {
  return <PromptsView />;
}
