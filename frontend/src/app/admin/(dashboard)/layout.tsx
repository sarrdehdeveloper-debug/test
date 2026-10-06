import type { ReactNode } from "react";
import { AdminAuthProvider } from "@/components/admin/AdminAuthProvider";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Every signed-in dashboard page: loads the session (`/auth/me`), redirects to the login page on
 * 401, renders the sidebar/top bar and blocks routes above the user's role (src/lib/admin/nav.ts).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}
