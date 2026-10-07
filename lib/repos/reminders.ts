/**
 * In-app reminders aggregates (P3-04). Firm-scoped; matter access when !viewAll.
 * No SMTP / push cloud — browser notifications are optional and in-session only.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, notInArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  calendarEventShares,
  calendarEvents,
  clients,
  matterDeadlines,
  matterTeam,
  matterTrackingEntries,
  matters,
  pendingProcedures,
} from "@/lib/db/schema";
import { addCalendarDays, harareToday, trackingDueAt } from "@/lib/matters/tracking";
import { clientDisplayName } from "@/lib/clients/display";
import { serializeMatterDeadline } from "@/lib/deadlines/serialize";
import { serializeProcedure } from "@/lib/procedures/serialize";

const DAY_MS = 24 * 60 * 60 * 1000;

function accessibleMatterIdsSubquery(firmId: string, userId: string) {
  const db = getDb();
  return db
    .select({ matterId: matterTeam.matterId })
    .from(matterTeam)
    .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, userId)));
}

function matterAccessCondition(firmId: string, userId: string, viewAll: boolean) {
  if (viewAll) return eq(matters.firmId, firmId);
  return and(
    eq(matters.firmId, firmId),
    or(
      eq(matters.responsibleLawyerId, userId),
      inArray(matters.id, accessibleMatterIdsSubquery(firmId, userId)),
    ),
  )!;
}

export type ReminderBuckets = {
  generatedAt: string;
  dueSoonDays: number;
  hearingHorizonDays: number;
  meetingHorizonDays: number;
  counts: {
    overdue: number;
    dueSoon: number;
    hearings: number;
    meetings: number;
    calendar: number;
    tracking: number;
    total: number;
  };
  overdue: ReminderItem[];
  dueSoon: ReminderItem[];
  hearings: ReminderItem[];
  meetings: ReminderItem[];
  /** Current matter-tracking lines whose date is still ahead, up to 60 days. */
  tracking: ReminderItem[];
  /** All calendar diary events the viewer can see (every event type). */
  calendar: ReminderItem[];
};

export type ReminderItem = {
  id: string;
  kind:
    | "procedure"
    | "deadline"
    | "hearing"
    | "calendar_hearing"
    | "meeting"
    | "calendar_event"
    | "tracking";
  title: string;
  dueAt: string;
  matterId: string | null;
  matterTitle: string | null;
  href: string;
  isOverdue: boolean;
  meta?: string | null;
};

export async function getReminders(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  dueSoonDays?: number;
  hearingHorizonDays?: number;
  limitPerBucket?: number;
}): Promise<ReminderBuckets> {
  const dueSoonDays = input.dueSoonDays ?? 7;
  const hearingHorizonDays = input.hearingHorizonDays ?? 60;
  const meetingHorizonDays = 7;
  const calendarHorizonDays = 60;
  const limit = input.limitPerBucket ?? 25;
  const now = new Date();
  const soonEnd = new Date(now.getTime() + dueSoonDays * DAY_MS);
  const hearingStart = new Date(now);
  hearingStart.setHours(0, 0, 0, 0);
  const hearingEnd = new Date(hearingStart.getTime() + hearingHorizonDays * DAY_MS);
  const calendarEnd = new Date(now.getTime() + calendarHorizonDays * DAY_MS);

  const [
    overdueProcedures,
    dueSoonProcedures,
    overdueDeadlines,
    dueSoonDeadlines,
    overdueHearings,
    hearings,
    meetings,
    calendar,
    trackingSplit,
  ] = await Promise.all([
    listProcedureReminders({ ...input, mode: "overdue", now, soonEnd, limit }),
    listProcedureReminders({ ...input, mode: "due_soon", now, soonEnd, limit }),
    listDeadlineReminders({ ...input, mode: "overdue", now, soonEnd, limit }),
    listDeadlineReminders({ ...input, mode: "due_soon", now, soonEnd, limit }),
    listHearingReminders({
      ...input,
      now: hearingStart,
      soonEnd: hearingEnd,
      limit,
      overdueOnly: true,
    }),
    listHearingReminders({
      ...input,
      now: hearingStart,
      soonEnd: hearingEnd,
      limit,
    }),
    listMeetingReminders({
      ...input,
      now,
      soonEnd,
      limit,
    }),
    listAllCalendarReminders({
      ...input,
      now,
      soonEnd: calendarEnd,
      limit: Math.max(limit, 80),
    }),
    listTrackingReminders({ ...input, limit }),
  ]);

  const overdue = [
    ...overdueProcedures,
    ...overdueDeadlines,
    ...overdueHearings,
    ...trackingSplit.overdue,
  ].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const dueSoon = [...dueSoonProcedures, ...dueSoonDeadlines].sort((a, b) =>
    a.dueAt.localeCompare(b.dueAt),
  );

  const counts = {
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    hearings: hearings.length,
    meetings: meetings.length,
    calendar: calendar.length,
    tracking: trackingSplit.upcoming.length,
    total:
      overdue.length +
      dueSoon.length +
      hearings.length +
      meetings.length +
      calendar.length +
      trackingSplit.upcoming.length,
  };

  return {
    generatedAt: now.toISOString(),
    dueSoonDays,
    hearingHorizonDays,
    meetingHorizonDays,
    counts,
    overdue: overdue.slice(0, limit),
    dueSoon: dueSoon.slice(0, limit),
    hearings: hearings.slice(0, limit),
    meetings: meetings.slice(0, limit),
    calendar: calendar.slice(0, Math.max(limit, 80)),
    tracking: trackingSplit.upcoming.slice(0, limit),
  };
}

const TRACKING_HORIZON_DAYS = 60;

async function listTrackingReminders(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  limit: number;
}): Promise<{ overdue: ReminderItem[]; upcoming: ReminderItem[] }> {
  const db = getDb();
  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);
  const today = harareToday();
  const horizon = addCalendarDays(today, TRACKING_HORIZON_DAYS);
  const rows = await db
    .selectDistinctOn([matterTrackingEntries.matterId], {
      id: matterTrackingEntries.id,
      matterId: matterTrackingEntries.matterId,
      summary: matterTrackingEntries.summary,
      happensOn: matterTrackingEntries.happensOn,
      matterTitle: matters.title,
    })
    .from(matterTrackingEntries)
    .innerJoin(matters, and(eq(matters.id, matterTrackingEntries.matterId), matterAccess))
    .where(
      and(
        eq(matterTrackingEntries.firmId, input.firmId),
        notInArray(matters.status, ["closed", "archived"]),
      ),
    )
    .orderBy(matterTrackingEntries.matterId, desc(matterTrackingEntries.createdAt));

  const overdue: ReminderItem[] = [];
  const upcoming: ReminderItem[] = [];
  for (const row of rows) {
    if (row.happensOn > horizon) continue;
    const item: ReminderItem = {
      id: `tracking:${row.id}`,
      kind: "tracking",
      title: row.summary,
      dueAt: trackingDueAt(row.happensOn),
      matterId: row.matterId,
      matterTitle: row.matterTitle,
      href: `/matters/${row.matterId}`,
      isOverdue: row.happensOn < today,
      meta: "Matter tracking",
    };
    if (item.isOverdue) overdue.push(item);
    else upcoming.push(item);
  }
  overdue.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  upcoming.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return {
    overdue: overdue.slice(0, input.limit),
    upcoming: upcoming.slice(0, input.limit),
  };
}

async function listProcedureReminders(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  mode: "overdue" | "due_soon";
  now: Date;
  soonEnd: Date;
  limit: number;
}): Promise<ReminderItem[]> {
  const db = getDb();
  const conditions = [
    eq(pendingProcedures.firmId, input.firmId),
    eq(pendingProcedures.status, "todo"),
    isNotNull(pendingProcedures.dueAt),
  ];
  if (!input.viewAll) {
    conditions.push(eq(pendingProcedures.assignedTo, input.userId));
  }
  if (input.mode === "overdue") {
    conditions.push(lt(pendingProcedures.dueAt, input.now));
  } else {
    conditions.push(gte(pendingProcedures.dueAt, input.now));
    conditions.push(lte(pendingProcedures.dueAt, input.soonEnd));
  }

  const rows = await db
    .select({
      procedure: pendingProcedures,
      matterTitle: matters.title,
    })
    .from(pendingProcedures)
    .innerJoin(
      matters,
      and(eq(matters.id, pendingProcedures.matterId), eq(matters.firmId, input.firmId)),
    )
    .where(and(...conditions))
    .orderBy(asc(pendingProcedures.dueAt))
    .limit(input.limit);

  return rows.map((row) => {
    const serialized = serializeProcedure(
      { ...row.procedure },
      { matterTitle: row.matterTitle },
    );
    return {
      id: `procedure:${row.procedure.id}`,
      kind: "procedure" as const,
      title: row.procedure.title,
      dueAt: row.procedure.dueAt!.toISOString(),
      matterId: row.procedure.matterId,
      matterTitle: row.matterTitle,
      href: `/matters/${row.procedure.matterId}`,
      isOverdue: Boolean(serialized.isOverdue),
      meta: "Procedure",
    };
  });
}

async function listDeadlineReminders(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  mode: "overdue" | "due_soon";
  now: Date;
  soonEnd: Date;
  limit: number;
}): Promise<ReminderItem[]> {
  const db = getDb();
  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);
  const conditions = [
    eq(matterDeadlines.firmId, input.firmId),
    eq(matterDeadlines.status, "open"),
  ];
  if (input.mode === "overdue") {
    conditions.push(lt(matterDeadlines.dueAt, input.now));
  } else {
    conditions.push(gte(matterDeadlines.dueAt, input.now));
    conditions.push(lte(matterDeadlines.dueAt, input.soonEnd));
  }

  const rows = await db
    .select({
      deadline: matterDeadlines,
      matterTitle: matters.title,
    })
    .from(matterDeadlines)
    .innerJoin(matters, and(eq(matters.id, matterDeadlines.matterId), matterAccess))
    .where(and(...conditions))
    .orderBy(asc(matterDeadlines.dueAt))
    .limit(input.limit);

  return rows.map((row) => {
    const serialized = serializeMatterDeadline(row.deadline, { now: input.now });
    return {
      id: `deadline:${row.deadline.id}`,
      kind: "deadline" as const,
      title: row.deadline.title,
      dueAt: row.deadline.dueAt.toISOString(),
      matterId: row.deadline.matterId,
      matterTitle: row.matterTitle,
      href: `/matters/${row.deadline.matterId}`,
      isOverdue: serialized.isOverdue,
      meta: "Filing deadline",
    };
  });
}

async function listHearingReminders(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  now: Date;
  soonEnd: Date;
  limit: number;
  overdueOnly?: boolean;
}): Promise<ReminderItem[]> {
  const db = getDb();
  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);
  const hearingTime = input.overdueOnly
    ? lt(matters.nextHearingAt, input.now)
    : and(gte(matters.nextHearingAt, input.now), lte(matters.nextHearingAt, input.soonEnd));
  const calendarTime = input.overdueOnly
    ? lt(calendarEvents.startsAt, input.now)
    : and(gte(calendarEvents.startsAt, input.now), lte(calendarEvents.startsAt, input.soonEnd));

  const matterHearings = await db
    .select({
      id: matters.id,
      title: matters.title,
      nextHearingAt: matters.nextHearingAt,
      courtName: matters.courtName,
    })
    .from(matters)
    .where(
      and(
        matterAccess,
        isNotNull(matters.nextHearingAt),
        hearingTime,
      ),
    )
    .orderBy(asc(matters.nextHearingAt))
    .limit(input.limit);

  const calendarHearings = await db
    .select({
      event: calendarEvents,
      matterTitle: matters.title,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, input.firmId)),
    )
    .where(
      and(
        eq(calendarEvents.firmId, input.firmId),
        eq(calendarEvents.eventType, "hearing"),
        calendarTime,
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .limit(input.limit * 2);

  let allowedMatterIds: Set<string> | null = null;
  if (!input.viewAll) {
    const allowed = await db
      .select({ id: matters.id })
      .from(matters)
      .where(
        and(
          eq(matters.firmId, input.firmId),
          or(
            eq(matters.responsibleLawyerId, input.userId),
            inArray(matters.id, accessibleMatterIdsSubquery(input.firmId, input.userId)),
          ),
        ),
      );
    allowedMatterIds = new Set(allowed.map((r) => r.id));
  }

  const fromMatters: ReminderItem[] = matterHearings.map((row) => ({
    id: `hearing-matter:${row.id}`,
    kind: "hearing" as const,
    title: `Hearing: ${row.title}`,
    dueAt: row.nextHearingAt!.toISOString(),
    matterId: row.id,
    matterTitle: row.title,
    href: `/matters/${row.id}`,
    isOverdue: Boolean(input.overdueOnly),
    meta: row.courtName ?? "Matter hearing",
  }));

  const fromCalendar: ReminderItem[] = calendarHearings
    .filter((row) => {
      if (!allowedMatterIds) return true;
      if (!row.event.matterId) return true;
      return allowedMatterIds.has(row.event.matterId);
    })
    .map((row) => ({
      id: `hearing-cal:${row.event.id}`,
      kind: "calendar_hearing" as const,
      title: row.event.title,
      dueAt: row.event.startsAt.toISOString(),
      matterId: row.event.matterId,
      matterTitle: row.matterTitle,
      href: row.event.matterId ? `/matters/${row.event.matterId}` : "/calendar",
      isOverdue: Boolean(input.overdueOnly),
      meta: row.event.location ?? "Calendar hearing",
    }));

  const seen = new Set<string>();
  const merged: ReminderItem[] = [];
  for (const item of [...fromMatters, ...fromCalendar].sort((a, b) =>
    a.dueAt.localeCompare(b.dueAt),
  )) {
    const key = `${item.matterId ?? "x"}:${item.dueAt.slice(0, 10)}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(0, input.limit);
}

async function listMeetingReminders(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  now: Date;
  soonEnd: Date;
  limit: number;
}): Promise<ReminderItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      event: calendarEvents,
      matterTitle: matters.title,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, input.firmId)),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, calendarEvents.clientId), eq(clients.firmId, input.firmId)),
    )
    .where(
      and(
        eq(calendarEvents.firmId, input.firmId),
        eq(calendarEvents.eventType, "appointment"),
        gte(calendarEvents.startsAt, input.now),
        lte(calendarEvents.startsAt, input.soonEnd),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .limit(input.limit * 2);

  let allowedMatterIds: Set<string> | null = null;
  if (!input.viewAll) {
    const allowed = await db
      .select({ id: matters.id })
      .from(matters)
      .where(
        and(
          eq(matters.firmId, input.firmId),
          or(
            eq(matters.responsibleLawyerId, input.userId),
            inArray(matters.id, accessibleMatterIdsSubquery(input.firmId, input.userId)),
          ),
        ),
      );
    allowedMatterIds = new Set(allowed.map((r) => r.id));
  }

  return rows
    .filter((row) => {
      if (!allowedMatterIds) return true;
      if (!row.event.matterId) return true;
      return allowedMatterIds.has(row.event.matterId);
    })
    .slice(0, input.limit)
    .map((row) => {
      const clientLabel =
        row.clientType != null
          ? clientDisplayName({
              clientType: row.clientType,
              fullName: row.clientFullName,
              legalName: row.clientLegalName,
              tradingName: row.clientTradingName,
            })
          : null;
      return {
        id: `meeting:${row.event.id}`,
        kind: "meeting" as const,
        title: row.event.title,
        dueAt: row.event.startsAt.toISOString(),
        matterId: row.event.matterId,
        matterTitle: row.matterTitle ?? clientLabel,
        href: row.event.matterId
          ? `/matters/${row.event.matterId}`
          : row.event.clientId
            ? `/clients/${row.event.clientId}`
            : "/calendar",
        isOverdue: false,
        meta: row.event.location ?? "Client meeting",
      };
    });
}

/** Every calendar diary event the viewer may see (all event types). */
async function listAllCalendarReminders(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  now: Date;
  soonEnd: Date;
  limit: number;
}): Promise<ReminderItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      event: calendarEvents,
      matterTitle: matters.title,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, input.firmId)),
    )
    .where(
      and(
        eq(calendarEvents.firmId, input.firmId),
        gte(calendarEvents.startsAt, input.now),
        lte(calendarEvents.startsAt, input.soonEnd),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .limit(Math.max(input.limit * 3, 120));

  const eventIds = rows.map((r) => r.event.id);
  const sharedIds = new Set<string>();
  if (eventIds.length) {
    const shareRows = await db
      .select({ eventId: calendarEventShares.eventId })
      .from(calendarEventShares)
      .where(
        and(
          eq(calendarEventShares.firmId, input.firmId),
          eq(calendarEventShares.userId, input.userId),
          inArray(calendarEventShares.eventId, eventIds),
        ),
      );
    for (const s of shareRows) sharedIds.add(s.eventId);
  }

  const typeLabel = (t: string) => {
    if (t === "appointment") return "Meeting";
    if (t === "hearing") return "Hearing";
    if (t === "deadline") return "Deadline";
    if (t === "filing") return "Filing";
    return "Event";
  };

  return rows
    .filter((row) => {
      const ev = row.event;
      if (ev.createdBy === input.userId) return true;
      if (ev.visibility === "firm") return true;
      if (ev.visibility === "people" && sharedIds.has(ev.id)) return true;
      return false;
    })
    .slice(0, input.limit)
    .map((row) => ({
      id: `calendar:${row.event.id}`,
      kind: "calendar_event" as const,
      title: row.event.title,
      dueAt: row.event.startsAt.toISOString(),
      matterId: row.event.matterId,
      matterTitle: row.matterTitle,
      href: row.event.matterId ? `/matters/${row.event.matterId}` : "/calendar",
      isOverdue: false,
      meta: `${typeLabel(row.event.eventType)}${
        row.event.location ? ` · ${row.event.location}` : ""
      }`,
    }));
}
