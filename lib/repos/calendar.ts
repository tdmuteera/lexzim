/**
 * Calendar / deadline repository (P3-01 stubs + P3-02 event CRUD + P3-03 deadlines + P10-12 privacy).
 * EVERY firm-scoped query MUST filter firmId.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import type { CalendarEventInput } from "@/lib/calendar/validation";
import {
  addCalendarDays,
  toCalendarEventType,
  type ApplyDeadlineInput,
  type DeadlineTemplateInput,
  type MatterDeadlineStatusUpdate,
} from "@/lib/deadlines/validation";
import { getDb } from "@/lib/db";
import {
  calendarEventGuests,
  calendarEventShares,
  calendarEvents,
  clients,
  deadlineTemplates,
  matterDeadlines,
  matterTeam,
  matters,
  users,
} from "@/lib/db/schema";
import type { CalendarGuestInput } from "@/lib/calendar/validation";
import { randomUUID } from "crypto";

const EMAIL_RE_SIMPLE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Marker so matter Next hearing rows can be updated without touching manual diary events. */
export const MATTER_HEARING_SYNC_NOTE = "Synced from matter Next hearing";

export type CalendarListScope = "mine" | "firm" | "shared" | "all";

export type ListCalendarEventsOpts = {
  from?: Date;
  to?: Date;
  eventType?: string;
  matterId?: string;
  /** When false, only firm events with no matter, or matters the user can access. */
  viewAll?: boolean;
  userId?: string;
  /**
   * List filter. Default `all` (everything the viewer may see).
   * `mine` / `all` are the same unified diary. `firm` and `shared` remain for API filters.
   */
  scope?: CalendarListScope;
};

export type CalendarEventListRow = {
  event: typeof calendarEvents.$inferSelect;
  matterNumber: string | null;
  matterTitle: string | null;
  clientType: string | null;
  clientFullName: string | null;
  clientLegalName: string | null;
  clientTradingName: string | null;
  creatorCalendarColor: string | null;
  creatorFullName: string | null;
  sharedUserIds?: string[];
  guests?: Array<{
    email: string;
    displayName: string | null;
    source: string;
    notify: boolean;
  }>;
};

export async function listSharesForEvent(firmId: string, eventId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: calendarEventShares.userId })
    .from(calendarEventShares)
    .where(
      and(eq(calendarEventShares.firmId, firmId), eq(calendarEventShares.eventId, eventId)),
    );
  return rows.map((r) => r.userId);
}

export async function listSharesForEvents(
  firmId: string,
  eventIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!eventIds.length) return map;
  const db = getDb();
  const rows = await db
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
  for (const row of rows) {
    const list = map.get(row.eventId) ?? [];
    list.push(row.userId);
    map.set(row.eventId, list);
  }
  return map;
}

export async function replaceEventShares(
  firmId: string,
  eventId: string,
  userIds: string[],
): Promise<void> {
  const db = getDb();
  await db
    .delete(calendarEventShares)
    .where(
      and(eq(calendarEventShares.firmId, firmId), eq(calendarEventShares.eventId, eventId)),
    );
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  await db.insert(calendarEventShares).values(
    unique.map((userId) => ({
      firmId,
      eventId,
      userId,
    })),
  );
}

export function canViewCalendarEvent(
  event: {
    visibility: string;
    createdBy: string | null;
  },
  viewerUserId: string,
  sharedUserIds: string[],
): boolean {
  if (event.createdBy === viewerUserId) return true;
  if (event.visibility === "firm") return true;
  if (event.visibility === "people") {
    return sharedUserIds.includes(viewerUserId);
  }
  return false;
}

export function canEditCalendarEvent(
  event: {
    visibility: string;
    createdBy: string | null;
  },
  viewerUserId: string,
  opts: { canManage: boolean; sharedUserIds: string[] },
): boolean {
  if (!canViewCalendarEvent(event, viewerUserId, opts.sharedUserIds)) return false;
  if (event.createdBy === viewerUserId) return true;
  return opts.canManage;
}

export async function getUserCalendarColor(
  firmId: string,
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ calendarColor: users.calendarColor })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .limit(1);
  return rows[0]?.calendarColor ?? null;
}

export async function setUserCalendarColor(
  firmId: string,
  userId: string,
  colour: string,
): Promise<string> {
  const db = getDb();
  const rows = await db
    .update(users)
    .set({ calendarColor: colour, updatedAt: new Date() })
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .returning({ calendarColor: users.calendarColor });
  return rows[0]?.calendarColor ?? colour;
}

export async function listCalendarEvents(firmId: string, opts?: ListCalendarEventsOpts) {
  const db = getDb();
  const scope: CalendarListScope = opts?.scope ?? "all";
  const userId = opts?.userId;
  const conditions = [eq(calendarEvents.firmId, firmId)];
  if (opts?.from) conditions.push(gte(calendarEvents.startsAt, opts.from));
  if (opts?.to) conditions.push(lte(calendarEvents.startsAt, opts.to));
  if (opts?.eventType) conditions.push(eq(calendarEvents.eventType, opts.eventType));
  if (opts?.matterId) conditions.push(eq(calendarEvents.matterId, opts.matterId));

  if (!userId) {
    // Safety: without a viewer, only return firm-visible rows.
    conditions.push(eq(calendarEvents.visibility, "firm"));
  } else if (scope === "all" || scope === "mine") {
    // One diary: own events, firm-wide events, and events shared with this user.
    const sharedIds = db
      .select({ eventId: calendarEventShares.eventId })
      .from(calendarEventShares)
      .where(
        and(eq(calendarEventShares.firmId, firmId), eq(calendarEventShares.userId, userId)),
      );
    conditions.push(
      or(
        eq(calendarEvents.createdBy, userId),
        eq(calendarEvents.visibility, "firm"),
        and(eq(calendarEvents.visibility, "people"), inArray(calendarEvents.id, sharedIds)),
      )!,
    );
  } else if (scope === "firm") {
    conditions.push(eq(calendarEvents.visibility, "firm"));
  } else if (scope === "shared") {
    const sharedIds = db
      .select({ eventId: calendarEventShares.eventId })
      .from(calendarEventShares)
      .where(
        and(eq(calendarEventShares.firmId, firmId), eq(calendarEventShares.userId, userId)),
      );
    conditions.push(eq(calendarEvents.visibility, "people"));
    conditions.push(inArray(calendarEvents.id, sharedIds));
    conditions.push(
      or(isNull(calendarEvents.createdBy), ne(calendarEvents.createdBy, userId))!,
    );
  }

  const rows = await db
    .select({
      event: calendarEvents,
      matterNumber: matters.matterNumber,
      matterTitle: matters.title,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      creatorCalendarColor: users.calendarColor,
      creatorFullName: users.fullName,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, calendarEvents.clientId), eq(clients.firmId, firmId)),
    )
    .leftJoin(users, eq(users.id, calendarEvents.createdBy))
    .where(and(...conditions))
    .orderBy(asc(calendarEvents.startsAt));

  const realIds = rows.map((r) => r.event.id);
  const shareMap = await listSharesForEvents(firmId, realIds);
  const withShares: CalendarEventListRow[] = rows.map((r) => ({
    ...r,
    sharedUserIds: shareMap.get(r.event.id) ?? [],
  }));

  if (opts?.eventType && opts.eventType !== "hearing") {
    return withShares;
  }
  if (scope === "shared") {
    return withShares;
  }

  const matterHearings = await listMatterHearingsForCalendar(firmId, opts);
  if (matterHearings.length === 0) return withShares;

  const covered = new Set(
    withShares
      .filter((r) => r.event.eventType === "hearing" && r.event.matterId)
      .map((r) => `${r.event.matterId}:${r.event.startsAt.toISOString().slice(0, 10)}`),
  );

  const merged = [...withShares];
  for (const extra of matterHearings) {
    const key = `${extra.event.matterId}:${extra.event.startsAt.toISOString().slice(0, 10)}`;
    if (covered.has(key)) continue;
    merged.push(extra);
  }
  merged.sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime());
  return merged;
}

async function listMatterHearingsForCalendar(
  firmId: string,
  opts?: ListCalendarEventsOpts,
): Promise<CalendarEventListRow[]> {
  const scope: CalendarListScope = opts?.scope ?? "all";
  const userId = opts?.userId;
  if (scope === "shared") return [];

  const db = getDb();
  const conditions = [eq(matters.firmId, firmId), isNotNull(matters.nextHearingAt)];
  if (opts?.from) conditions.push(gte(matters.nextHearingAt, opts.from));
  if (opts?.to) conditions.push(lte(matters.nextHearingAt, opts.to));
  if (opts?.matterId) conditions.push(eq(matters.id, opts.matterId));

  // Unified diary and firm: show hearings on matters this user can access.
  if (userId && opts?.viewAll === false) {
    const teamMatterIds = db
      .select({ matterId: matterTeam.matterId })
      .from(matterTeam)
      .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, userId)));
    conditions.push(
      or(eq(matters.responsibleLawyerId, userId), inArray(matters.id, teamMatterIds))!,
    );
  }

  const rows = await db
    .select({
      id: matters.id,
      title: matters.title,
      matterNumber: matters.matterNumber,
      courtName: matters.courtName,
      nextHearingAt: matters.nextHearingAt,
      createdBy: matters.createdBy,
      createdAt: matters.createdAt,
      updatedAt: matters.updatedAt,
      responsibleLawyerId: matters.responsibleLawyerId,
      creatorCalendarColor: users.calendarColor,
      creatorFullName: users.fullName,
    })
    .from(matters)
    .leftJoin(users, eq(users.id, matters.createdBy))
    .where(and(...conditions))
    .orderBy(asc(matters.nextHearingAt));

  return rows
    .filter((row) => row.nextHearingAt)
    .map((row) => {
      const startsAt = row.nextHearingAt!;
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      return {
        event: {
          id: `matter-hearing:${row.id}`,
          firmId,
          matterId: row.id,
          clientId: null,
          eventType: "hearing",
          title: `Hearing: ${row.title}`,
          description: MATTER_HEARING_SYNC_NOTE,
          location: row.courtName,
          startsAt,
          endsAt,
          allDay: false,
          visibility: "firm",
          recurrenceRule: null,
          recurrenceUntil: null,
          seriesId: null,
          postponedFrom: null,
          notifyClient: false,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        matterNumber: row.matterNumber,
        matterTitle: row.title,
        clientType: null,
        clientFullName: null,
        clientLegalName: null,
        clientTradingName: null,
        creatorCalendarColor: row.creatorCalendarColor,
        creatorFullName: row.creatorFullName,
        sharedUserIds: [],
      };
    });
}

/** Keep a diary hearing in step with the matter Next hearing field. */
export async function syncMatterHearingEvent(input: {
  firmId: string;
  userId: string | null;
  matterId: string;
  matterTitle: string;
  courtName: string | null;
  nextHearingAt: Date | null;
}) {
  const db = getDb();
  const existing = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.firmId, input.firmId),
        eq(calendarEvents.matterId, input.matterId),
        eq(calendarEvents.eventType, "hearing"),
        eq(calendarEvents.description, MATTER_HEARING_SYNC_NOTE),
      ),
    )
    .limit(1);

  if (!input.nextHearingAt) {
    if (existing[0]) {
      await db
        .delete(calendarEvents)
        .where(
          and(eq(calendarEvents.firmId, input.firmId), eq(calendarEvents.id, existing[0].id)),
        );
    }
    return;
  }

  const endsAt = new Date(input.nextHearingAt.getTime() + 60 * 60 * 1000);
  const values = {
    title: `Hearing: ${input.matterTitle}`,
    location: input.courtName,
    startsAt: input.nextHearingAt,
    endsAt,
    allDay: false,
    description: MATTER_HEARING_SYNC_NOTE,
    visibility: "firm",
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(calendarEvents)
      .set(values)
      .where(and(eq(calendarEvents.firmId, input.firmId), eq(calendarEvents.id, existing[0].id)));
    return;
  }

  await db.insert(calendarEvents).values({
    firmId: input.firmId,
    matterId: input.matterId,
    eventType: "hearing",
    createdBy: input.userId,
    ...values,
  });
}

export async function listDeadlineTemplates(firmId: string, activeOnly = true) {
  const db = getDb();
  const conditions = [eq(deadlineTemplates.firmId, firmId)];
  if (activeOnly) conditions.push(eq(deadlineTemplates.isActive, true));
  return db
    .select()
    .from(deadlineTemplates)
    .where(and(...conditions))
    .orderBy(asc(deadlineTemplates.name));
}

export async function getDeadlineTemplate(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(deadlineTemplates)
    .where(and(eq(deadlineTemplates.firmId, firmId), eq(deadlineTemplates.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDeadlineTemplate(firmId: string, input: DeadlineTemplateInput) {
  const db = getDb();
  const rows = await db
    .insert(deadlineTemplates)
    .values({
      firmId,
      name: input.name,
      areaOfLaw: input.areaOfLaw,
      description: input.description,
      offsetDays: input.offsetDays,
      defaultEventType: input.defaultEventType,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateDeadlineTemplate(
  firmId: string,
  id: string,
  input: DeadlineTemplateInput,
) {
  const db = getDb();
  const rows = await db
    .update(deadlineTemplates)
    .set({
      name: input.name,
      areaOfLaw: input.areaOfLaw,
      description: input.description,
      offsetDays: input.offsetDays,
      defaultEventType: input.defaultEventType,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(deadlineTemplates.firmId, firmId), eq(deadlineTemplates.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteDeadlineTemplate(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .delete(deadlineTemplates)
    .where(and(eq(deadlineTemplates.firmId, firmId), eq(deadlineTemplates.id, id)))
    .returning({ id: deadlineTemplates.id });
  return rows[0] ?? null;
}

export async function listMatterDeadlines(firmId: string, matterId: string) {
  const db = getDb();
  return db
    .select()
    .from(matterDeadlines)
    .where(and(eq(matterDeadlines.firmId, firmId), eq(matterDeadlines.matterId, matterId)))
    .orderBy(asc(matterDeadlines.dueAt));
}

export async function getMatterDeadline(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(matterDeadlines)
    .where(and(eq(matterDeadlines.firmId, firmId), eq(matterDeadlines.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Apply a template: triggerDate + offsetDays → dueAt.
 * Optionally creates a calendar filing/deadline event linked to the matter.
 */
export async function applyDeadlineTemplate(
  firmId: string,
  matterId: string,
  userId: string,
  input: ApplyDeadlineInput,
) {
  const template = await getDeadlineTemplate(firmId, input.templateId);
  if (!template || !template.isActive) {
    return { error: "template_not_found" as const };
  }

  const dueAt = addCalendarDays(input.triggerDate, template.offsetDays);
  const title = input.titleOverride?.trim() || template.name;
  let calendarEventId: string | null = null;

  if (input.createCalendarEvent) {
    const event = await createCalendarEvent(firmId, userId, {
      matterId,
      clientId: null,
      eventType: toCalendarEventType(template.defaultEventType),
      title,
      description: template.description,
      location: "Deadline",
      startsAt: dueAt,
      endsAt: null,
      allDay: true,
      visibility: "firm",
      sharedUserIds: [],
    });
    calendarEventId = event.id;
  }

  const db = getDb();
  const rows = await db
    .insert(matterDeadlines)
    .values({
      firmId,
      matterId,
      templateId: template.id,
      title,
      dueAt,
      status: "open",
      notes: input.notes,
      calendarEventId,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();

  return {
    error: null,
    deadline: rows[0]!,
    template,
    dueAt,
    calendarEventId,
  };
}

export async function updateMatterDeadlineStatus(
  firmId: string,
  id: string,
  input: MatterDeadlineStatusUpdate,
) {
  const db = getDb();
  const patch: {
    status: string;
    updatedAt: Date;
    notes?: string | null;
  } = {
    status: input.status,
    updatedAt: new Date(),
  };
  if ("notes" in input) {
    patch.notes = input.notes ?? null;
  }
  const rows = await db
    .update(matterDeadlines)
    .set(patch)
    .where(and(eq(matterDeadlines.firmId, firmId), eq(matterDeadlines.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteMatterDeadline(firmId: string, id: string) {
  const db = getDb();
  const existing = await getMatterDeadline(firmId, id);
  if (!existing) return null;

  const rows = await db
    .delete(matterDeadlines)
    .where(and(eq(matterDeadlines.firmId, firmId), eq(matterDeadlines.id, id)))
    .returning({ id: matterDeadlines.id, calendarEventId: matterDeadlines.calendarEventId });

  const deleted = rows[0];
  if (deleted?.calendarEventId) {
    await deleteCalendarEvent(firmId, deleted.calendarEventId);
  }
  return deleted ?? null;
}

export async function getCalendarEvent(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      event: calendarEvents,
      matterNumber: matters.matterNumber,
      matterTitle: matters.title,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      creatorCalendarColor: users.calendarColor,
      creatorFullName: users.fullName,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, calendarEvents.clientId), eq(clients.firmId, firmId)),
    )
    .leftJoin(users, eq(users.id, calendarEvents.createdBy))
    .where(and(eq(calendarEvents.firmId, firmId), eq(calendarEvents.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const sharedUserIds = await listSharesForEvent(firmId, id);
  const guestRows = await listGuestsForEvent(firmId, id);
  return {
    ...row,
    sharedUserIds,
    guests: guestRows.map((g) => ({
      email: g.email,
      displayName: g.displayName,
      source: g.source,
      notify: g.notify,
    })),
  };
}

export async function createCalendarEvent(
  firmId: string,
  userId: string,
  input: CalendarEventInput,
) {
  const db = getDb();
  const visibility = input.visibility ?? "private";
  const notifyClient = Boolean(input.notifyClient);
  const guests = [...(input.guests ?? [])];
  if (notifyClient && input.clientId) {
    const clientRows = await db
      .select({
        email: clients.email,
        fullName: clients.fullName,
        legalName: clients.legalName,
        tradingName: clients.tradingName,
      })
      .from(clients)
      .where(and(eq(clients.firmId, firmId), eq(clients.id, input.clientId)))
      .limit(1);
    const client = clientRows[0];
    const email = client?.email?.trim().toLowerCase();
    if (email && EMAIL_RE_SIMPLE.test(email) && !guests.some((g) => g.email === email)) {
      guests.push({
        email,
        displayName:
          client.fullName || client.legalName || client.tradingName || null,
        source: "client",
        notify: true,
      });
    }
  }
  const recurrenceRule = input.recurrenceRule ?? null;
  const recurrenceUntil = input.recurrenceUntil ?? null;
  const seriesId = recurrenceRule ? randomUUID() : null;

  const durationMs =
    input.endsAt && input.startsAt
      ? Math.max(0, input.endsAt.getTime() - input.startsAt.getTime())
      : 0;

  const occurrenceStarts = buildRecurrenceStarts(
    input.startsAt,
    recurrenceRule,
    recurrenceUntil,
  );

  const createdIds: string[] = [];
  let firstEvent: (typeof calendarEvents.$inferSelect) | null = null;

  for (let i = 0; i < occurrenceStarts.length; i++) {
    const startsAt = occurrenceStarts[i]!;
    const endsAt =
      durationMs > 0 ? new Date(startsAt.getTime() + durationMs) : input.endsAt;
    const rows = await db
      .insert(calendarEvents)
      .values({
        firmId,
        matterId: input.matterId,
        clientId: input.clientId,
        eventType: input.eventType,
        title: input.title,
        description: input.description,
        location: input.location,
        startsAt,
        endsAt,
        allDay: input.allDay,
        visibility,
        recurrenceRule: i === 0 ? recurrenceRule : recurrenceRule,
        recurrenceUntil: i === 0 ? recurrenceUntil : null,
        seriesId,
        notifyClient,
        createdBy: userId,
        updatedAt: new Date(),
      })
      .returning();
    const event = rows[0]!;
    createdIds.push(event.id);
    if (!firstEvent) firstEvent = event;

    if (visibility === "people") {
      await replaceEventShares(firmId, event.id, input.sharedUserIds ?? []);
    }
    await replaceEventGuests(firmId, event.id, guests);
  }

  const primary = firstEvent!;
  // No email on create. The only calendar email is the 08:00 Harare reminder on the day.
  return primary;
}

function buildRecurrenceStarts(
  start: Date,
  rule: string | null,
  until: Date | null,
): Date[] {
  if (!rule || !until) return [start];
  const out: Date[] = [start];
  const max = rule === "weekly" ? 26 : 12;
  let cursor = new Date(start);
  while (out.length < max) {
    const next = new Date(cursor);
    if (rule === "weekly") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    if (next > until) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

async function replaceEventGuests(
  firmId: string,
  eventId: string,
  guests: CalendarGuestInput[],
) {
  const db = getDb();
  await db
    .delete(calendarEventGuests)
    .where(
      and(eq(calendarEventGuests.firmId, firmId), eq(calendarEventGuests.eventId, eventId)),
    );
  if (!guests.length) return;
  await db.insert(calendarEventGuests).values(
    guests.map((g) => ({
      firmId,
      eventId,
      email: g.email,
      displayName: g.displayName,
      source: g.source,
      notify: g.notify,
    })),
  );
}

export async function listGuestsForEvent(firmId: string, eventId: string) {
  const db = getDb();
  return db
    .select()
    .from(calendarEventGuests)
    .where(
      and(eq(calendarEventGuests.firmId, firmId), eq(calendarEventGuests.eventId, eventId)),
    );
}

export async function postponeCalendarEvent(
  firmId: string,
  id: string,
  input: { startsAt: Date; endsAt: Date | null; allDay: boolean },
) {
  const db = getDb();
  const existing = await getCalendarEvent(firmId, id);
  if (!existing) return null;

  const rows = await db
    .update(calendarEvents)
    .set({
      postponedFrom: existing.event.startsAt,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      updatedAt: new Date(),
    })
    .where(and(eq(calendarEvents.firmId, firmId), eq(calendarEvents.id, id)))
    .returning();
  const event = rows[0] ?? null;
  if (!event) return null;

  try {
    const { notifyCalendarEventPostponed } = await import(
      "@/lib/calendar/calendar-event-emails"
    );
    await notifyCalendarEventPostponed({
      firmId,
      eventId: id,
      previousStartsAt: existing.event.startsAt,
    });
  } catch {
    // best-effort
  }

  return getCalendarEvent(firmId, id);
}

export async function updateCalendarEvent(
  firmId: string,
  id: string,
  input: CalendarEventInput,
) {
  const db = getDb();
  const visibility = input.visibility ?? "private";
  const notifyClient = Boolean(input.notifyClient);
  const guests = [...(input.guests ?? [])];
  if (notifyClient && input.clientId) {
    const clientRows = await db
      .select({
        email: clients.email,
        fullName: clients.fullName,
        legalName: clients.legalName,
        tradingName: clients.tradingName,
      })
      .from(clients)
      .where(and(eq(clients.firmId, firmId), eq(clients.id, input.clientId)))
      .limit(1);
    const client = clientRows[0];
    const email = client?.email?.trim().toLowerCase();
    if (email && EMAIL_RE_SIMPLE.test(email) && !guests.some((g) => g.email === email)) {
      guests.push({
        email,
        displayName:
          client.fullName || client.legalName || client.tradingName || null,
        source: "client",
        notify: true,
      });
    }
  }
  const rows = await db
    .update(calendarEvents)
    .set({
      matterId: input.matterId,
      clientId: input.clientId,
      eventType: input.eventType,
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      visibility,
      notifyClient,
      updatedAt: new Date(),
    })
    .where(and(eq(calendarEvents.firmId, firmId), eq(calendarEvents.id, id)))
    .returning();
  const event = rows[0] ?? null;
  if (!event) return null;
  if (visibility === "people") {
    await replaceEventShares(firmId, id, input.sharedUserIds ?? []);
  } else {
    await replaceEventShares(firmId, id, []);
  }
  await replaceEventGuests(firmId, id, guests);
  return event;
}

export async function deleteCalendarEvent(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.firmId, firmId), eq(calendarEvents.id, id)))
    .returning({ id: calendarEvents.id });
  return rows[0] ?? null;
}

/** Validate shared users belong to the firm and are active system users. */
export async function assertSharedUsersInFirm(firmId: string, userIds: string[]) {
  if (!userIds.length) return;
  const db = getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.firmId, firmId),
        eq(users.isActive, true),
        eq(users.isSystemUser, true),
        inArray(users.id, userIds),
      ),
    );
  if (rows.length !== userIds.length) {
    throw new AuthError("validation", "One or more shared users are invalid for this firm.");
  }
}
