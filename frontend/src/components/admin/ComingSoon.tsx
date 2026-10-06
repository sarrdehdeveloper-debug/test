import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import type { IconName } from "./icons";
import { PageHeader, type Breadcrumb } from "./PageHeader";
import { Panel } from "./Panel";

/**
 * Placeholder for a dashboard page that is not built yet (keeps navigation working).
 * Replace the whole page.tsx when implementing the section.
 */
export function ComingSoon({
  title,
  description,
  icon = "sparkle",
  breadcrumbs,
}: {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  breadcrumbs?: Breadcrumb[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} />
      <Panel>
        <EmptyState
          icon={icon}
          title="Coming soon"
          description="This section of the dashboard is being built. Everything else in the menu keeps working."
        />
      </Panel>
    </>
  );
}
