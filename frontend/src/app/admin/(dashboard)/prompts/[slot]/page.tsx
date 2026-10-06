import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PromptSlotView } from "./PromptSlotView";

function parseSlot(raw: string): number | null {
  const slot = Number(raw);
  return Number.isInteger(slot) && slot >= 1 && slot <= 6 && String(slot) === raw ? slot : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/prompts/[slot]">): Promise<Metadata> {
  const { slot } = await params;
  const value = parseSlot(slot);
  return { title: value ? `Prompt · Section ${value}` : "Not found" };
}

export default async function PromptSlotPage({ params }: PageProps<"/admin/prompts/[slot]">) {
  const { slot } = await params;
  const value = parseSlot(slot);
  if (value === null) notFound();
  // Keyed: switching sections must not carry editor state over.
  return <PromptSlotView key={value} slot={value} />;
}
