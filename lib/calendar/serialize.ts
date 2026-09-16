import type { calendarEvents } from "@/lib/db/schema";
import { clientDisplayName } from "@/lib/clients/display";

type CalendarEventRow = typeof calendarEvents.$inferSelect;

export type SerializedCalendarEvent = {
  id: string;
  firmId: string;
  matterId: string | null;
  clientId: string | null;
  clientDisplayName: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  eventType: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  visibility: string;
  sharedUserIds?: string[];
  creatorCalendarColor?: string | null;
  creatorFullName?: string | null;
  canEdit?: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeCalendarEvent(
  row: CalendarEventRow,
  extras?: {
    matterNumber?: string | null;
    title?: string | null;
    clientType?: string | null;
    clientFullName?: string | null;
    clientLegalName?: string | null;
    clientTradingName?: string | null;
    sharedUserIds?: string[];
    creatorCalendarColor?: string | null;
    creatorFullName?: string | null;
    canEdit?: boolean;
  } | null,
): SerializedCalendarEvent {
  const matterNumber = extras?.matterNumber ?? null;
  const matterTitle = extras?.title ?? null;
  const clientDisplay =
    extras?.clientType != null
      ? clientDisplayName({
          clientType: extras.clientType,
          fullName: extras.clientFullName,
          legalName: extras.clientLegalName,
          tradingName: extras.clientTradingName,
        })
      : null;

  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    clientId: row.clientId,
    clientDisplayName: clientDisplay,
    matterNumber,
    matterTitle,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    allDay: row.allDay,
    visibility: row.visibility ?? "private",
    sharedUserIds: extras?.sharedUserIds,
    creatorCalendarColor: extras?.creatorCalendarColor ?? null,
    creatorFullName: extras?.creatorFullName ?? null,
    canEdit: extras?.canEdit,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeCalendarEventRow(row: {
  event: CalendarEventRow;
  matterNumber?: string | null;
  matterTitle?: string | null;
  clientType?: string | null;
  clientFullName?: string | null;
  clientLegalName?: string | null;
  clientTradingName?: string | null;
  sharedUserIds?: string[];
  creatorCalendarColor?: string | null;
  creatorFullName?: string | null;
  canEdit?: boolean;
}) {
  return serializeCalendarEvent(row.event, {
    matterNumber: row.matterNumber,
    title: row.matterTitle,
    clientType: row.clientType,
    clientFullName: row.clientFullName,
    clientLegalName: row.clientLegalName,
    clientTradingName: row.clientTradingName,
    sharedUserIds: row.sharedUserIds,
    creatorCalendarColor: row.creatorCalendarColor,
    creatorFullName: row.creatorFullName,
    canEdit: row.canEdit,
  });
}
