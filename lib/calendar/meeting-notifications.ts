import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import { calendarEvents, clients, matters, staffNotifications } from "@/lib/db/schema";
import { createStaffNotification } from "@/lib/notifications/staff";

const DAY_MS = 24 * 60 * 60 * 1000;
const MEETING_REMINDER_TYPE = "meeting_reminder";

/** Create in-app notifications for client meetings in the next 7 days (idempotent per event). */
export async function syncMeetingRemindersForFirm(firmId: string) {
  const db = getDb();
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * DAY_MS);

  const events = await db
    .select({
      event: calendarEvents,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      matterTitle: matters.title,
    })
    .from(calendarEvents)
    .leftJoin(clients, and(eq(clients.id, calendarEvents.clientId), eq(clients.firmId, firmId)))
    .leftJoin(matters, and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, firmId)))
    .where(
      and(
        eq(calendarEvents.firmId, firmId),
        eq(calendarEvents.eventType, "appointment"),
        gte(calendarEvents.startsAt, now),
        lte(calendarEvents.startsAt, horizon),
      ),
    );

  if (!events.length) return;

  const notifiedRows = await db
    .select()
    .from(staffNotifications)
    .where(
      and(eq(staffNotifications.firmId, firmId), eq(staffNotifications.type, MEETING_REMINDER_TYPE)),
    );

  const notifiedEventIds = new Set<string>();
  for (const row of notifiedRows) {
    const meta = row.metadataJson as { calendarEventId?: string } | null;
    if (meta?.calendarEventId) notifiedEventIds.add(meta.calendarEventId);
  }

  for (const row of events) {
    if (notifiedEventIds.has(row.event.id)) continue;

    const clientLabel =
      row.clientType != null
        ? clientDisplayName({
            clientType: row.clientType,
            fullName: row.clientFullName,
            legalName: row.clientLegalName,
            tradingName: row.clientTradingName,
          })
        : null;

    const when = row.event.startsAt.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const parts = [clientLabel, row.matterTitle].filter(Boolean);
    const body =
      parts.length > 0
        ? `${parts.join(" · ")}${row.event.location ? ` · ${row.event.location}` : ""}`
        : row.event.location;

    await createStaffNotification({
      firmId,
      userId: row.event.createdBy,
      type: MEETING_REMINDER_TYPE,
      title: `Meeting: ${row.event.title} · ${when}`,
      body,
      href: "/calendar",
      metadata: { calendarEventId: row.event.id },
    });
  }
}
