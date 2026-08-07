import type { calendarEvents } from "@/lib/db/schema";

type CalendarEventRow = typeof calendarEvents.$inferSelect;

export type SerializedCalendarEvent = {
  id: string;
  firmId: string;
  matterId: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  eventType: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeCalendarEvent(
  row: CalendarEventRow,
  matter?: { matterNumber: string | null; title: string | null } | null,
): SerializedCalendarEvent {
  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    matterNumber: matter?.matterNumber ?? null,
    matterTitle: matter?.title ?? null,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    allDay: row.allDay,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
