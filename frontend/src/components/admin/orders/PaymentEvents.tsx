import { CopyButton } from "@/components/admin/CopyButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { JsonPreview } from "@/components/admin/JsonPreview";
import { Badge, type BadgeTone } from "@/components/admin/StatusBadge";
import { formatDateTime, humanize } from "@/lib/admin/format";
import type { AdminPaymentEvent } from "@/lib/admin/types";

const OUTCOME_TONES: Record<string, BadgeTone> = {
  paid: "success",
  refunded: "warning",
  ignored: "neutral",
  duplicate: "neutral",
  failed: "danger",
  expired: "neutral",
};

/** Payment provider webhooks/events of an order, oldest first, with the raw data on demand. */
export function PaymentEvents({ events }: { events: AdminPaymentEvent[] }) {
  if (!events.length) {
    return (
      <EmptyState
        compact
        icon="discounts"
        title="No payment events"
        description="Events from the payment provider (checkout completed, refunds…) appear here."
      />
    );
  }
  return (
    <ol className="divide-y divide-stone-100">
      {events.map((event) => (
        <li key={event.id} className="space-y-2 px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[0.8125rem] font-medium text-ink">
              {event.event_type}
            </span>
            <Badge tone={OUTCOME_TONES[event.outcome] ?? "info"} dot>
              {humanize(event.outcome)}
            </Badge>
            <span className="text-xs text-ink-soft">
              {humanize(event.provider)} ·{" "}
              <time dateTime={event.received_at}>
                {formatDateTime(event.received_at, { seconds: true })}
              </time>
            </span>
          </div>
          <p className="flex min-w-0 items-center gap-1 text-xs text-ink-soft">
            <span className="shrink-0">Event id</span>
            <span className="min-w-0 truncate font-mono text-ink" dir="ltr" title={event.event_id}>
              {event.event_id}
            </span>
            <CopyButton value={event.event_id} label="Copy event id" />
          </p>
          <JsonPreview value={event.data} label="Event data" collapsible />
        </li>
      ))}
    </ol>
  );
}
