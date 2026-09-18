/**
 * Scheduled calendar event emails (firm-wide).
 * Slots (Africa/Harare): 17:00 day before, 08:00 day of.
 * Recipients: creator + shared people. Subject = event title.
 * All calendar event types.
 */
import "server-only";

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import {
  calendarEventShares,
  calendarEvents,
  clients,
  firms,
  matters,
  staffNotifications,
} from "@/lib/db/schema";
import { notifyStaffEvent } from "@/lib/notifications/notify-staff-event";

export const CALENDAR_EVENT_EMAIL_TYPE = "calendar_event_email";
export const CALENDAR_TZ = "Africa/Harare";

export type CalendarEmailSlot = "day_before" | "day_of";

function harareParts(d: Date): { y: number; m: number; day: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: CALENDAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
  };
}

/** Start/end UTC bounds for a calendar day in Africa/Harare (UTC+2, no DST). */
function harareDayBounds(y: number, m: number, day: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(y, m - 1, day, 0, 0, 0) - 2 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(y, m - 1, day + 1, 0, 0, 0) - 2 * 60 * 60 * 1000);
  return { start, end };
}

function addHarareCalendarDays(y: number, m: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(y, m - 1, day + delta));
  return {
    y: utc.getUTCFullYear(),
    m: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function resolveCalendarEmailSlot(now = new Date()): {
  slot: CalendarEmailSlot | null;
  hour: number;
} {
  const { hour } = harareParts(now);
  if (hour === 17) return { slot: "day_before", hour };
  if (hour === 8) return { slot: "day_of", hour };
  return { slot: null, hour };
}

async function loadAlreadySentKeys(firmId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({
      userId: staffNotifications.userId,
      metadataJson: staffNotifications.metadataJson,
    })
    .from(staffNotifications)
    .where(
      and(
        eq(staffNotifications.firmId, firmId),
        eq(staffNotifications.type, CALENDAR_EVENT_EMAIL_TYPE),
      ),
    );
  const keys = new Set<string>();
  for (const row of rows) {
    const meta = row.metadataJson as {
      calendarEventId?: string;
      slot?: string;
      userId?: string;
    } | null;
    if (!meta?.calendarEventId || !meta.slot) continue;
    const uid = meta.userId ?? row.userId ?? "";
    keys.add(`${meta.calendarEventId}:${meta.slot}:${uid}`);
  }
  return keys;
}

export async function sendCalendarEventEmailsForFirm(
  firmId: string,
  opts?: { now?: Date; forceSlot?: CalendarEmailSlot },
): Promise<{ slot: CalendarEmailSlot | null; emailed: number; skipped: number }> {
  const now = opts?.now ?? new Date();
  const resolved = resolveCalendarEmailSlot(now);
  const slot = opts?.forceSlot ?? resolved.slot;
  if (!slot) {
    return { slot: null, emailed: 0, skipped: 0 };
  }

  const { y, m, day } = harareParts(now);
  const dayTarget =
    slot === "day_before" ? addHarareCalendarDays(y, m, day, 1) : { y, m, day };
  const { start, end } = harareDayBounds(dayTarget.y, dayTarget.m, dayTarget.day);

  const db = getDb();
  const events = await db
    .select({
      event: calendarEvents,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(calendarEvents)
    .leftJoin(clients, and(eq(clients.id, calendarEvents.clientId), eq(clients.firmId, firmId)))
    .leftJoin(matters, and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, firmId)))
    .where(
      and(
        eq(calendarEvents.firmId, firmId),
        gte(calendarEvents.startsAt, start),
        lt(calendarEvents.startsAt, end),
      ),
    );

  if (!events.length) return { slot, emailed: 0, skipped: 0 };

  const eventIds = events.map((e) => e.event.id);
  const sharesByEvent = new Map<string, string[]>();
  const shareRows = await db
    .select({
      eventId: calendarEventShares.eventId,
      userId: calendarEventShares.userId,
    })
    .from(calendarEventShares)
    .where(
      and(eq(calendarEventShares.firmId, firmId), inArray(calendarEventShares.eventId, eventIds)),
    );
  for (const row of shareRows) {
    const list = sharesByEvent.get(row.eventId) ?? [];
    list.push(row.userId);
    sharesByEvent.set(row.eventId, list);
  }

  const sentKeys = await loadAlreadySentKeys(firmId);
  let emailed = 0;
  let skipped = 0;

  for (const row of events) {
    const recipients = new Set<string>();
    if (row.event.createdBy) recipients.add(row.event.createdBy);
    for (const uid of sharesByEvent.get(row.event.id) ?? []) recipients.add(uid);
    if (!recipients.size) continue;

    const when = row.event.startsAt.toLocaleString("en-GB", {
      timeZone: CALENDAR_TZ,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const clientLabel =
      row.clientType != null
        ? clientDisplayName({
            clientType: row.clientType,
            fullName: row.clientFullName,
            legalName: row.clientLegalName,
            tradingName: row.clientTradingName,
          })
        : null;
    const detailParts = [
      slot === "day_before" ? "Tomorrow" : "Today",
      when,
      clientLabel,
      row.matterNumber ? `Matter ${row.matterNumber}` : row.matterTitle,
      row.event.location,
    ].filter(Boolean);

    const subject = row.event.title;
    const body = detailParts.join(" · ");

    for (const userId of recipients) {
      const key = `${row.event.id}:${slot}:${userId}`;
      if (sentKeys.has(key)) {
        skipped += 1;
        continue;
      }
      const result = await notifyStaffEvent({
        firmId,
        userIds: [userId],
        subject,
        body,
        inApp: {
          type: CALENDAR_EVENT_EMAIL_TYPE,
          title: subject,
          body,
          href: "/calendar",
          metadata: {
            calendarEventId: row.event.id,
            slot,
            userId,
          },
        },
      });
      emailed += result.emailed;
      sentKeys.add(key);
    }
  }

  return { slot, emailed, skipped };
}

/**
 * On event create: email the creator and everyone shared on the event
 * with the title and key details. Best-effort (does not throw to callers).
 */
export async function notifyCalendarEventCreated(input: {
  firmId: string;
  eventId: string;
  createdByUserId: string;
  sharedUserIds?: string[];
}): Promise<{ emailed: number; emailFailed: number }> {
  const db = getDb();
  const rows = await db
    .select({
      event: calendarEvents,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(calendarEvents)
    .leftJoin(
      clients,
      and(eq(clients.id, calendarEvents.clientId), eq(clients.firmId, input.firmId)),
    )
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, input.firmId)),
    )
    .where(
      and(eq(calendarEvents.firmId, input.firmId), eq(calendarEvents.id, input.eventId)),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return { emailed: 0, emailFailed: 0 };

  const shareIds =
    input.sharedUserIds ??
    (
      await db
        .select({ userId: calendarEventShares.userId })
        .from(calendarEventShares)
        .where(
          and(
            eq(calendarEventShares.firmId, input.firmId),
            eq(calendarEventShares.eventId, input.eventId),
          ),
        )
    ).map((r) => r.userId);

  const recipients = new Set<string>();
  if (input.createdByUserId) recipients.add(input.createdByUserId);
  for (const uid of shareIds) {
    if (uid) recipients.add(uid);
  }
  if (!recipients.size) return { emailed: 0, emailFailed: 0 };

  const when = row.event.startsAt.toLocaleString("en-GB", {
    timeZone: CALENDAR_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const endWhen = row.event.endsAt
    ? row.event.endsAt.toLocaleString("en-GB", {
        timeZone: CALENDAR_TZ,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const clientLabel =
    row.clientType != null
      ? clientDisplayName({
          clientType: row.clientType,
          fullName: row.clientFullName,
          legalName: row.clientLegalName,
          tradingName: row.clientTradingName,
        })
      : null;

  const detailLines = [
    `A calendar event was created.`,
    `Title: ${row.event.title}`,
    `When: ${when}${endWhen ? ` to ${endWhen}` : ""}${row.event.allDay ? " (all day)" : ""}`,
    row.event.location ? `Location: ${row.event.location}` : null,
    clientLabel ? `Client: ${clientLabel}` : null,
    row.matterNumber
      ? `Matter: ${row.matterNumber}${row.matterTitle ? ` · ${row.matterTitle}` : ""}`
      : row.matterTitle
        ? `Matter: ${row.matterTitle}`
        : null,
    row.event.description?.trim() ? `Notes: ${row.event.description.trim()}` : null,
  ].filter(Boolean) as string[];

  const subject = `Event created: ${row.event.title}`;
  const body = detailLines.join("\n");

  const result = await notifyStaffEvent({
    firmId: input.firmId,
    userIds: [...recipients],
    subject,
    body,
    inApp: {
      type: "calendar_event_created",
      title: subject,
      body: detailLines.slice(0, 3).join(" · "),
      href: "/calendar",
      metadata: {
        calendarEventId: row.event.id,
        slot: "created",
      },
    },
  });

  return { emailed: result.emailed, emailFailed: result.emailFailed };
}

export async function sendCalendarEventEmailsForAllFirms(opts?: {
  now?: Date;
  forceSlot?: CalendarEmailSlot;
}) {
  const db = getDb();
  const firmRows = await db.select({ id: firms.id, name: firms.name }).from(firms);
  const results: Array<{
    firmId: string;
    firmName: string;
    slot: CalendarEmailSlot | null;
    emailed: number;
    skipped: number;
  }> = [];
  for (const firm of firmRows) {
    const r = await sendCalendarEventEmailsForFirm(firm.id, opts);
    results.push({
      firmId: firm.id,
      firmName: firm.name,
      slot: r.slot,
      emailed: r.emailed,
      skipped: r.skipped,
    });
  }
  return results;
}
