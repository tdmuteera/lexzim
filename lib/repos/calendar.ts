/**
 * Calendar / deadline repository (P3-01 stubs + P3-02 event CRUD + P3-03 deadlines).
 * EVERY firm-scoped query MUST filter firmId.
 */
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
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
  calendarEvents,
  deadlineTemplates,
  matterDeadlines,
  matterTeam,
  matters,
} from "@/lib/db/schema";

export type ListCalendarEventsOpts = {
  from?: Date;
  to?: Date;
  eventType?: string;
  matterId?: string;
  /** When false, only firm events with no matter, or matters the user can access. */
  viewAll?: boolean;
  userId?: string;
};

export async function listCalendarEvents(firmId: string, opts?: ListCalendarEventsOpts) {
  const db = getDb();
  const conditions = [eq(calendarEvents.firmId, firmId)];
  if (opts?.from) conditions.push(gte(calendarEvents.startsAt, opts.from));
  if (opts?.to) conditions.push(lte(calendarEvents.startsAt, opts.to));
  if (opts?.eventType) conditions.push(eq(calendarEvents.eventType, opts.eventType));
  if (opts?.matterId) conditions.push(eq(calendarEvents.matterId, opts.matterId));

  if (opts?.viewAll === false && opts.userId) {
    const teamMatterIds = db
      .select({ matterId: matterTeam.matterId })
      .from(matterTeam)
      .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, opts.userId)));
    conditions.push(
      or(
        isNull(calendarEvents.matterId),
        inArray(
          calendarEvents.matterId,
          db
            .select({ id: matters.id })
            .from(matters)
            .where(
              and(
                eq(matters.firmId, firmId),
                or(
                  eq(matters.responsibleLawyerId, opts.userId),
                  inArray(matters.id, teamMatterIds),
                ),
              ),
            ),
        ),
      )!,
    );
  }

  return db
    .select({
      event: calendarEvents,
      matterNumber: matters.matterNumber,
      matterTitle: matters.title,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, firmId)),
    )
    .where(and(...conditions))
    .orderBy(asc(calendarEvents.startsAt));
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
      eventType: toCalendarEventType(template.defaultEventType),
      title,
      description: template.description,
      location: null,
      startsAt: dueAt,
      endsAt: null,
      allDay: true,
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
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, firmId)),
    )
    .where(and(eq(calendarEvents.firmId, firmId), eq(calendarEvents.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCalendarEvent(
  firmId: string,
  userId: string,
  input: CalendarEventInput,
) {
  const db = getDb();
  const rows = await db
    .insert(calendarEvents)
    .values({
      firmId,
      matterId: input.matterId,
      eventType: input.eventType,
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateCalendarEvent(
  firmId: string,
  id: string,
  input: CalendarEventInput,
) {
  const db = getDb();
  const rows = await db
    .update(calendarEvents)
    .set({
      matterId: input.matterId,
      eventType: input.eventType,
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      updatedAt: new Date(),
    })
    .where(and(eq(calendarEvents.firmId, firmId), eq(calendarEvents.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteCalendarEvent(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.firmId, firmId), eq(calendarEvents.id, id)))
    .returning({ id: calendarEvents.id });
  return rows[0] ?? null;
}
