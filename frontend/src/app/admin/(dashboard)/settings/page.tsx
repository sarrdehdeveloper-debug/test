import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Settings" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      description="Price, AI generation, report delivery, calculation method and privacy."
      icon="settings"
    />
  );
}
