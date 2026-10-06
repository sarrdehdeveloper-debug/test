import type { Metadata } from "next";
import { AccountView } from "./AccountView";

export const metadata: Metadata = { title: "Account" };

/** /admin/account — profile, password change and two-factor authentication (every role). */
export default function AdminAccountPage() {
  return <AccountView />;
}
