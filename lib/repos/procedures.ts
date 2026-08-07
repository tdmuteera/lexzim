/**
 * Pending procedures repository (P1-04).
 * EVERY query MUST filter by firmId.
 */
import { and, asc, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { matters, pendingProcedures, users } from "@/lib/db/schema";
import type { ProcedureInput } from "@/lib/procedures/validation";
import type { ProcedureStatus } from "@/lib/db/mvp-types";

export type ProcedureListRow = typeof pendingProcedures.$inferSelect & {
  assigneeName: string | null;
  matterTitle: string | null;
};

function valuesFromInput(input: ProcedureInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    assignedTo: input.assignedTo ?? null,
  };
}

function stampsForStatus(status: ProcedureStatus, existingCompletedAt?: Date | null) {
  if (status === "done") {
    return { completedAt: existingCompletedAt ?? new Date() };
  }
  return { completedAt: null as Date | null };
}

export async function listProceduresForMatter(firmId: string, matterId: string) {
  const db = getDb();
  const rows = await db
    .select({
      procedure: pendingProcedures,
      assigneeName: users.fullName,
      matterTitle: matters.title,
    })
    .from(pendingProcedures)
    .innerJoin(matters, and(eq(matters.id, pendingProcedures.matterId), eq(matters.firmId, firmId)))
    .leftJoin(users, eq(users.id, pendingProcedures.assignedTo))
    .where(and(eq(pendingProcedures.firmId, firmId), eq(pendingProcedures.matterId, matterId)))
    .orderBy(asc(pendingProcedures.dueAt), asc(pendingProcedures.createdAt));

  return rows.map((row) => ({
    ...row.procedure,
    assigneeName: row.assigneeName ?? null,
    matterTitle: row.matterTitle,
  }));
}

export async function getProcedureById(firmId: string, procedureId: string) {
  const db = getDb();
  const rows = await db
    .select({
      procedure: pendingProcedures,
      assigneeName: users.fullName,
      matterTitle: matters.title,
    })
    .from(pendingProcedures)
    .innerJoin(matters, and(eq(matters.id, pendingProcedures.matterId), eq(matters.firmId, firmId)))
    .leftJoin(users, eq(users.id, pendingProcedures.assignedTo))
    .where(and(eq(pendingProcedures.firmId, firmId), eq(pendingProcedures.id, procedureId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row.procedure,
    assigneeName: row.assigneeName ?? null,
    matterTitle: row.matterTitle,
  };
}

export async function createProcedure(
  firmId: string,
  matterId: string,
  userId: string,
  input: ProcedureInput,
) {
  const db = getDb();
  const status: ProcedureStatus = input.status ?? "todo";
  const rows = await db
    .insert(pendingProcedures)
    .values({
      firmId,
      matterId,
      createdBy: userId,
      status,
      ...valuesFromInput(input),
      ...stampsForStatus(status),
    })
    .returning();
  return rows[0];
}

export async function updateProcedure(
  firmId: string,
  procedureId: string,
  input: ProcedureInput,
) {
  const existing = await getProcedureById(firmId, procedureId);
  if (!existing) return null;

  const status = (input.status ?? existing.status) as ProcedureStatus;
  const db = getDb();
  const rows = await db
    .update(pendingProcedures)
    .set({
      ...valuesFromInput(input),
      status,
      updatedAt: new Date(),
      ...stampsForStatus(status, existing.completedAt),
    })
    .where(and(eq(pendingProcedures.firmId, firmId), eq(pendingProcedures.id, procedureId)))
    .returning();
  return rows[0] ?? null;
}

export async function updateProcedureStatus(
  firmId: string,
  procedureId: string,
  status: ProcedureStatus,
) {
  const existing = await getProcedureById(firmId, procedureId);
  if (!existing) return null;

  const db = getDb();
  const rows = await db
    .update(pendingProcedures)
    .set({
      status,
      updatedAt: new Date(),
      ...stampsForStatus(status, existing.completedAt),
    })
    .where(and(eq(pendingProcedures.firmId, firmId), eq(pendingProcedures.id, procedureId)))
    .returning();
  return rows[0] ?? null;
}

/**
 * Upcoming/overdue todo procedures for the signed-in user (Dashboard P1-10 prep).
 * Includes items assigned to the user, or all firm todos if viewAll.
 */
export async function listMyProcedures(
  firmId: string,
  userId: string,
  opts?: {
    viewAll?: boolean;
    mode?: "upcoming" | "overdue" | "all_open";
    limit?: number;
  },
) {
  const db = getDb();
  const now = new Date();
  const mode = opts?.mode ?? "all_open";
  const conditions = [
    eq(pendingProcedures.firmId, firmId),
    eq(pendingProcedures.status, "todo"),
  ];

  if (!opts?.viewAll) {
    conditions.push(eq(pendingProcedures.assignedTo, userId));
  }

  if (mode === "overdue") {
    conditions.push(isNotNull(pendingProcedures.dueAt));
    conditions.push(lt(pendingProcedures.dueAt, now));
  } else if (mode === "upcoming") {
    conditions.push(
      or(isNull(pendingProcedures.dueAt), gt(pendingProcedures.dueAt, now))!,
    );
  }

  const rows = await db
    .select({
      procedure: pendingProcedures,
      assigneeName: users.fullName,
      matterTitle: matters.title,
    })
    .from(pendingProcedures)
    .innerJoin(matters, and(eq(matters.id, pendingProcedures.matterId), eq(matters.firmId, firmId)))
    .leftJoin(users, eq(users.id, pendingProcedures.assignedTo))
    .where(and(...conditions))
    .orderBy(asc(pendingProcedures.dueAt), asc(pendingProcedures.createdAt))
    .limit(opts?.limit ?? 50);

  return rows.map((row) => ({
    ...row.procedure,
    assigneeName: row.assigneeName ?? null,
    matterTitle: row.matterTitle,
  }));
}

/** Keep legacy stub name used by P1-01. */
export async function listPendingProcedures(firmId: string, matterId?: string) {
  if (matterId) return listProceduresForMatter(firmId, matterId);
  const db = getDb();
  return db
    .select()
    .from(pendingProcedures)
    .where(eq(pendingProcedures.firmId, firmId))
    .orderBy(asc(pendingProcedures.dueAt));
}
