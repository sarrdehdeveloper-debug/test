import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Users" };

/** Placeholder (keeps the navigation working) — replace this file when building the section. */
export default function UsersPage() {
  return (
    <ComingSoon
      title="Users"
      description="Admin accounts, roles and two-factor resets."
      icon="users"
    />
  );
}
