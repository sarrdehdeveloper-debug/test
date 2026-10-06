import { AdminButtonLink } from "@/components/admin/AdminButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { Panel } from "@/components/admin/Panel";

/** Unknown dashboard URL (or `notFound()` from a page): shown inside the shell. */
export default function DashboardNotFound() {
  return (
    <Panel className="mt-2">
      <EmptyState
        icon="search"
        title="Page not found"
        description="This dashboard page does not exist. It may have been moved or the link is mistyped."
        action={
          <AdminButtonLink href="/admin" variant="primary" icon="overview">
            Back to overview
          </AdminButtonLink>
        }
      />
    </Panel>
  );
}
