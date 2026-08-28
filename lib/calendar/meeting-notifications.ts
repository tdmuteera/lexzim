import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import {
  calendarEventShares,
  calendarEvents,
  clients,
  matters,
  staffNotifications,
} from "@/lib/db/schema";
import { createStaffNotification } from "@/lib/notifications/staff";

const DAY_MS = 24 * 60 * 60 * 1000;
const MEETING_REMINDER_TYPE = "meeting_reminder";

/** Create in-app notifications for client meetings in the next 7 days (idempotent per event + user). */
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

  const eventIds = events.map((e) => e.event.id);
  const sharesByEvent = new Map<string, string[]>();
  if (eventIds.length) {
    const shareRows = await db
      .select({
        eventId: calendarEventShares.eventId,
        userId: calendarEventShares.userId,
      })
      .from(calendarEventShares)
      .where(
        and(
          eq(calendarEventShares.firmId, firmId),
          inArray(calendarEventShares.eventId, eventIds),
        ),
      );
    for (const row of shareRows) {
      const list = sharesByEvent.get(row.eventId) ?? [];
      list.push(row.userId);
      sharesByEvent.set(row.eventId, list);
    }
  }

  const notifiedRows = await db
    .select()
    .from(staffNotifications)
    .where(
      and(eq(staffNotifications.firmId, firmId), eq(staffNotifications.type, MEETING_REMINDER_TYPE)),
    );

  const notifiedKeys = new Set<string>();
  for (const row of notifiedRows) {
    const meta = row.metadataJson as { calendarEventId?: string; userId?: string } | null;
    if (meta?.calendarEventId) {
      const uid = meta.userId ?? row.userId ?? "";
      notifiedKeys.add(`${meta.calendarEventId}:${uid}`);
    }
  }

  for (const row of events) {
    const recipients = new Set<string>();
    if (row.event.createdBy) recipients.add(row.event.createdBy);
    for (const uid of sharesByEvent.get(row.event.id) ?? []) {
      recipients.add(uid);
    }
    if (!recipients.size) continue;

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

    for (const userId of recipients) {
      const key = `${row.event.id}:${userId}`;
      if (notifiedKeys.has(key)) continue;

      await createStaffNotification({
        firmId,
        userId,
        type: MEETING_REMINDER_TYPE,
        title: `Meeting: ${row.event.title} · ${when}`,
        body,
        href: "/calendar",
        metadata: { calendarEventId: row.event.id, userId },
      });
      notifiedKeys.add(key);
    }
  }
}
