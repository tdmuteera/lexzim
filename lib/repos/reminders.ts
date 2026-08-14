/**
 * In-app reminders aggregates (P3-04). Firm-scoped; matter access when !viewAll.
 * No SMTP / push cloud — browser notifications are optional and in-session only.
 */
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  calendarEvents,
  matterDeadlines,
  matterTeam,
  matters,
  pendingProcedures,
} from "@/lib/db/schema";
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
  counts: {
    overdue: number;
    dueSoon: number;
    hearings: number;
    total: number;
  };
  overdue: ReminderItem[];
  dueSoon: ReminderItem[];
  hearings: ReminderItem[];
};

export type ReminderItem = {
  id: string;
  kind: "procedure" | "deadline" | "hearing" | "calendar_hearing";
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
  const limit = input.limitPerBucket ?? 25;
  const now = new Date();
  const soonEnd = new Date(now.getTime() + dueSoonDays * DAY_MS);
  const hearingStart = new Date(now);
  hearingStart.setHours(0, 0, 0, 0);
  const hearingEnd = new Date(hearingStart.getTime() + hearingHorizonDays * DAY_MS);

  const [
    overdueProcedures,
    dueSoonProcedures,
    overdueDeadlines,
    dueSoonDeadlines,
    overdueHearings,
    hearings,
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
  ]);

  const overdue = [...overdueProcedures, ...overdueDeadlines, ...overdueHearings].sort((a, b) =>
    a.dueAt.localeCompare(b.dueAt),
  );
  const dueSoon = [...dueSoonProcedures, ...dueSoonDeadlines].sort((a, b) =>
    a.dueAt.localeCompare(b.dueAt),
  );

  const counts = {
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    hearings: hearings.length,
    total: overdue.length + dueSoon.length + hearings.length,
  };

  return {
    generatedAt: now.toISOString(),
    dueSoonDays,
    hearingHorizonDays,
    counts,
    overdue: overdue.slice(0, limit),
    dueSoon: dueSoon.slice(0, limit),
    hearings: hearings.slice(0, limit),
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
