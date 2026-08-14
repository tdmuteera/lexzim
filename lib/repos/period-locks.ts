/**
 * Finance month-end period locks (Phase 6 P6-10).
 */
import { and, desc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { financePeriodLocks, users } from "@/lib/db/schema";

export async function listPeriodLocks(firmId: string, limit = 24) {
  const db = getDb();
  return db
    .select({
      lock: financePeriodLocks,
      lockedByName: users.fullName,
    })
    .from(financePeriodLocks)
    .leftJoin(users, eq(users.id, financePeriodLocks.lockedBy))
    .where(eq(financePeriodLocks.firmId, firmId))
    .orderBy(desc(financePeriodLocks.periodYear), desc(financePeriodLocks.periodMonth))
    .limit(limit);
}

export async function getPeriodLock(firmId: string, year: number, month: number) {
  const db = getDb();
  const rows = await db
    .select({
      lock: financePeriodLocks,
      lockedByName: users.fullName,
    })
    .from(financePeriodLocks)
    .leftJoin(users, eq(users.id, financePeriodLocks.lockedBy))
    .where(
      and(
        eq(financePeriodLocks.firmId, firmId),
        eq(financePeriodLocks.periodYear, year),
        eq(financePeriodLocks.periodMonth, month),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function isPeriodLocked(firmId: string, year: number, month: number): Promise<boolean> {
  const row = await getPeriodLock(firmId, year, month);
  return row !== null;
}

export async function lockFinancePeriod(firmId: string, userId: string, year: number, month: number) {
  if (month < 1 || month > 12) {
    throw new AuthError("validation", "Month must be between 1 and 12.");
  }
  const existing = await getPeriodLock(firmId, year, month);
  if (existing) {
    throw new AuthError("validation", "This period is already locked.");
  }

  const db = getDb();
  const rows = await db
    .insert(financePeriodLocks)
    .values({
      firmId,
      periodYear: year,
      periodMonth: month,
      lockedBy: userId,
    })
    .returning();
  return rows[0]!;
}

/** Block postings when the calendar month of `date` is locked. */
export async function assertPeriodNotLocked(firmId: string, date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (await isPeriodLocked(firmId, year, month)) {
    throw new AuthError(
      "validation",
      `Finance period ${year}-${String(month).padStart(2, "0")} is locked for month-end close.`,
    );
  }
}
