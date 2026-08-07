/**
 * Intake + conflict check stubs (P3-01).
 * EVERY firm-scoped query MUST filter firmId.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conflictChecks, intakes } from "@/lib/db/schema";

export async function listIntakes(firmId: string, status?: string) {
  const db = getDb();
  const conditions = [eq(intakes.firmId, firmId)];
  if (status) conditions.push(eq(intakes.status, status));
  return db
    .select()
    .from(intakes)
    .where(and(...conditions))
    .orderBy(desc(intakes.updatedAt));
}

export async function getIntake(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(intakes)
    .where(and(eq(intakes.firmId, firmId), eq(intakes.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listConflictChecks(firmId: string, intakeId?: string) {
  const db = getDb();
  const conditions = [eq(conflictChecks.firmId, firmId)];
  if (intakeId) conditions.push(eq(conflictChecks.intakeId, intakeId));
  return db
    .select()
    .from(conflictChecks)
    .where(and(...conditions))
    .orderBy(desc(conflictChecks.createdAt));
}
