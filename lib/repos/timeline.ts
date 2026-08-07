/**
 * Matter timeline repository (P1-05).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { matterEvents, users } from "@/lib/db/schema";
import type { TimelineNoteInput } from "@/lib/timeline/validation";

export type MatterEventRow = typeof matterEvents.$inferSelect & {
  createdByName: string | null;
};

export async function listMatterEvents(
  firmId: string,
  matterId: string,
  opts?: { eventTypes?: string[]; sortDir?: "asc" | "desc" },
): Promise<MatterEventRow[]> {
  const db = getDb();
  const conditions = [eq(matterEvents.firmId, firmId), eq(matterEvents.matterId, matterId)];
  if (opts?.eventTypes?.length) {
    conditions.push(inArray(matterEvents.eventType, opts.eventTypes));
  }

  const orderFn = opts?.sortDir === "asc" ? asc : desc;

  const rows = await db
    .select({
      event: matterEvents,
      createdByName: users.fullName,
    })
    .from(matterEvents)
    .leftJoin(users, eq(users.id, matterEvents.createdBy))
    .where(and(...conditions))
    .orderBy(orderFn(matterEvents.eventAt), orderFn(matterEvents.createdAt));

  return rows.map((row) => ({
    ...row.event,
    createdByName: row.createdByName ?? null,
  }));
}

export async function createMatterEvent(input: {
  firmId: string;
  matterId: string;
  eventType: string;
  title: string;
  body?: string | null;
  createdBy?: string | null;
  eventAt?: Date;
}) {
  const db = getDb();
  const rows = await db
    .insert(matterEvents)
    .values({
      firmId: input.firmId,
      matterId: input.matterId,
      eventType: input.eventType,
      title: input.title,
      body: input.body ?? null,
      createdBy: input.createdBy ?? null,
      eventAt: input.eventAt ?? new Date(),
    })
    .returning();
  return rows[0];
}

export async function createTimelineNote(
  firmId: string,
  matterId: string,
  userId: string,
  input: TimelineNoteInput,
) {
  return createMatterEvent({
    firmId,
    matterId,
    eventType: input.eventType,
    title: input.title,
    body: input.body ?? null,
    createdBy: userId,
    eventAt: input.eventAt ? new Date(input.eventAt) : new Date(),
  });
}

export async function getMatterEventById(firmId: string, eventId: string) {
  const db = getDb();
  const rows = await db
    .select({
      event: matterEvents,
      createdByName: users.fullName,
    })
    .from(matterEvents)
    .leftJoin(users, eq(users.id, matterEvents.createdBy))
    .where(and(eq(matterEvents.firmId, firmId), eq(matterEvents.id, eventId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row.event,
    createdByName: row.createdByName ?? null,
  };
}
