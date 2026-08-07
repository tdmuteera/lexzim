import type { matterEvents } from "@/lib/db/schema";
import { eventTypeLabel } from "@/lib/timeline/validation";

type EventRow = typeof matterEvents.$inferSelect;

export function serializeMatterEvent(
  row: EventRow,
  extras?: { createdByName?: string | null },
) {
  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    eventType: row.eventType,
    eventTypeLabel: eventTypeLabel(row.eventType),
    title: row.title,
    body: row.body,
    eventAt: row.eventAt.toISOString(),
    createdBy: row.createdBy,
    createdByName: extras?.createdByName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
