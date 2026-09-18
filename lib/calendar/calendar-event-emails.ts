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
import { getAppPublicUrl } from "@/lib/env";
import { notifyStaffEvent } from "@/lib/notifications/notify-staff-event";

export const CALENDAR_EVENT_EMAIL_TYPE = "calendar_event_email";
export const CALENDAR_TZ = "Africa/Harare";

export type CalendarEmailSlot = "day_before" | "day_of";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEventWhen(opts: {
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
}): string {
  const dateOpts: Intl.DateTimeFormatOptions = {
    timeZone: CALENDAR_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone: CALENDAR_TZ,
    hour: "2-digit",
    minute: "2-digit",
  };

  if (opts.allDay) {
    const day = opts.startsAt.toLocaleDateString("en-GB", dateOpts);
    return `${day} · All day`;
  }

  const startDay = opts.startsAt.toLocaleDateString("en-GB", dateOpts);
  const startTime = opts.startsAt.toLocaleTimeString("en-GB", timeOpts);
  if (!opts.endsAt) return `${startDay}, ${startTime}`;

  const endDay = opts.endsAt.toLocaleDateString("en-GB", dateOpts);
  const endTime = opts.endsAt.toLocaleTimeString("en-GB", timeOpts);
  if (startDay === endDay) return `${startDay}, ${startTime} to ${endTime}`;
  return `${startDay}, ${startTime} to ${endDay}, ${endTime}`;
}

function calendarAppLink(): string {
  const base = getAppPublicUrl();
  return base ? `${base}/calendar` : "/calendar";
}

function buildCalendarEventCreatedBodies(input: {
  title: string;
  when: string;
  location?: string | null;
  client?: string | null;
  matter?: string | null;
  notes?: string | null;
}): { text: string; html: string } {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Title", value: input.title },
    { label: "When", value: input.when },
  ];
  if (input.location?.trim()) rows.push({ label: "Location", value: input.location.trim() });
  if (input.client?.trim()) rows.push({ label: "Client", value: input.client.trim() });
  if (input.matter?.trim()) rows.push({ label: "Matter", value: input.matter.trim() });
  if (input.notes?.trim()) rows.push({ label: "Notes", value: input.notes.trim() });

  const link = calendarAppLink();
  const text = [
    "A calendar event was created.",
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
  ].join("\n");

  const detailRowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 16px 8px 0;vertical-align:top;width:96px;color:#5b6b7c;font-size:13px;font-weight:700;letter-spacing:0.02em;">
          ${escapeHtml(r.label)}
        </td>
        <td style="padding:8px 0;vertical-align:top;color:#122433;font-size:14px;line-height:1.45;">
          ${escapeHtml(r.value).replace(/\n/g, "<br/>")}
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f6f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9e2ec;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background:#0e2f4a;padding:18px 24px;">
              <div style="color:#9fb4c7;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">LexZim Calendar</div>
              <div style="margin-top:6px;color:#ffffff;font-size:18px;font-weight:700;line-height:1.3;">Event created</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 8px 24px;color:#122433;font-size:15px;line-height:1.5;">
              A calendar event was created.
            </td>
          </tr>
          <tr>
            <td style="padding:4px 24px 8px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6edf3;border-bottom:1px solid #e6edf3;">
                ${detailRowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px 24px;">
              <a href="${escapeHtml(link)}" style="display:inline-block;background:#1b6f6d;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 16px;border-radius:6px;">
                Open in LexZim
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

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

  const when = formatEventWhen({
    startsAt: row.event.startsAt,
    endsAt: row.event.endsAt,
    allDay: Boolean(row.event.allDay),
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
  const matterLabel = row.matterNumber
    ? `${row.matterNumber}${row.matterTitle ? ` · ${row.matterTitle}` : ""}`
    : row.matterTitle;

  const { text, html } = buildCalendarEventCreatedBodies({
    title: row.event.title,
    when,
    location: row.event.location,
    client: clientLabel,
    matter: matterLabel,
    notes: row.event.description?.trim() || null,
  });

  const subject = `Event created: ${row.event.title}`;

  const result = await notifyStaffEvent({
    firmId: input.firmId,
    userIds: [...recipients],
    subject,
    body: text,
    html,
    inApp: {
      type: "calendar_event_created",
      title: subject,
      body: `${row.event.title} · ${when}`,
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
