/**
 * Payroll MVP: periods, lines, advance recovery. Not a statutory tax engine.
 */
import "server-only";

import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  hrPayrollLines,
  hrPayrollPeriods,
  hrSalaryAdvances,
  hrStaffProfiles,
} from "@/lib/db/schema";
import type { PayrollPeriodCreateInput } from "@/lib/hr/validation";

export async function listPayrollPeriods(firmId: string) {
  const db = getDb();
  return db
    .select()
    .from(hrPayrollPeriods)
    .where(eq(hrPayrollPeriods.firmId, firmId))
    .orderBy(desc(hrPayrollPeriods.periodStart));
}

export async function getPayrollPeriod(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(hrPayrollPeriods)
    .where(and(eq(hrPayrollPeriods.firmId, firmId), eq(hrPayrollPeriods.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPayrollPeriod(
  firmId: string,
  createdBy: string,
  input: PayrollPeriodCreateInput,
) {
  const db = getDb();
  const rows = await db
    .insert(hrPayrollPeriods)
    .values({
      firmId,
      label: input.label,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "open",
      createdBy,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function listPayrollLines(firmId: string, periodId: string) {
  const db = getDb();
  return db
    .select({
      line: hrPayrollLines,
      staffName: hrStaffProfiles.fullName,
      employeeNumber: hrStaffProfiles.employeeNumber,
    })
    .from(hrPayrollLines)
    .innerJoin(hrStaffProfiles, eq(hrPayrollLines.staffProfileId, hrStaffProfiles.id))
    .where(and(eq(hrPayrollLines.firmId, firmId), eq(hrPayrollLines.periodId, periodId)))
    .orderBy(asc(hrStaffProfiles.fullName));
}

export async function getPayrollPeriodWithLines(firmId: string, periodId: string) {
  const period = await getPayrollPeriod(firmId, periodId);
  if (!period) return null;
  const lines = await listPayrollLines(firmId, periodId);
  return { period, lines };
}

/**
 * Generate (or refresh unpaid) lines for active staff with a gross salary.
 * Advances outstanding = sum balanceRemaining where status paid/decided and balance > 0.
 * Deduction = min(sum monthlyDeduction, or full balance if no monthly).
 */
export async function generatePayrollLines(firmId: string, periodId: string) {
  const period = await getPayrollPeriod(firmId, periodId);
  if (!period) {
    throw new AuthError("not_found", "Payroll period not found.");
  }
  if (period.status === "closed") {
    throw new AuthError("validation", "Cannot generate lines for a closed period.");
  }

  const db = getDb();
  const staff = await db
    .select()
    .from(hrStaffProfiles)
    .where(and(eq(hrStaffProfiles.firmId, firmId), eq(hrStaffProfiles.isActive, true)));

  const advances = await db
    .select()
    .from(hrSalaryAdvances)
    .where(
      and(
        eq(hrSalaryAdvances.firmId, firmId),
        inArray(hrSalaryAdvances.status, ["decided", "paid"]),
        gt(hrSalaryAdvances.balanceRemainingCents, 0),
      ),
    );

  const advancesByStaff = new Map<string, typeof advances>();
  for (const a of advances) {
    const list = advancesByStaff.get(a.staffProfileId) ?? [];
    list.push(a);
    advancesByStaff.set(a.staffProfileId, list);
  }

  const existingLines = await db
    .select()
    .from(hrPayrollLines)
    .where(and(eq(hrPayrollLines.firmId, firmId), eq(hrPayrollLines.periodId, periodId)));
  const paidStaffIds = new Set(
    existingLines.filter((l) => l.paidAt).map((l) => l.staffProfileId),
  );

  const generated = [];
  for (const s of staff) {
    if (paidStaffIds.has(s.id)) continue;
    const gross = s.grossSalaryCents ?? 0;
    if (gross <= 0) continue;

    const staffAdvances = advancesByStaff.get(s.id) ?? [];
    const advanceIds = staffAdvances.map((a) => a.id);
    const outstanding = staffAdvances.reduce((sum, a) => sum + a.balanceRemainingCents, 0);

    let deduction = 0;
    if (outstanding > 0) {
      const monthlySum = staffAdvances.reduce(
        (sum, a) => sum + (a.monthlyDeductionCents ?? 0),
        0,
      );
      if (monthlySum > 0) {
        deduction = Math.min(monthlySum, outstanding, gross);
      } else {
        deduction = Math.min(outstanding, gross);
      }
    }

    const net = Math.max(0, gross - deduction);

    const [row] = await db
      .insert(hrPayrollLines)
      .values({
        firmId,
        periodId,
        staffProfileId: s.id,
        grossCents: gross,
        advancesOutstandingCents: outstanding,
        deductionsCents: deduction,
        netPayableCents: net,
        advanceIdsJson: advanceIds,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [hrPayrollLines.periodId, hrPayrollLines.staffProfileId],
        set: {
          grossCents: gross,
          advancesOutstandingCents: outstanding,
          deductionsCents: deduction,
          netPayableCents: net,
          advanceIdsJson: advanceIds,
          updatedAt: new Date(),
        },
      })
      .returning();

    generated.push(row!);
  }

  return generated;
}

export async function getPayrollLine(firmId: string, lineId: string) {
  const db = getDb();
  const rows = await db
    .select({
      line: hrPayrollLines,
      staffName: hrStaffProfiles.fullName,
    })
    .from(hrPayrollLines)
    .innerJoin(hrStaffProfiles, eq(hrPayrollLines.staffProfileId, hrStaffProfiles.id))
    .where(and(eq(hrPayrollLines.firmId, firmId), eq(hrPayrollLines.id, lineId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Mark a payroll line paid and apply deductions to linked advances' balanceRemainingCents.
 */
export async function markPayrollLinePaid(
  firmId: string,
  lineId: string,
  paidByUserId: string,
) {
  const existing = await getPayrollLine(firmId, lineId);
  if (!existing) {
    throw new AuthError("not_found", "Payroll line not found.");
  }
  if (existing.line.paidAt) {
    throw new AuthError("validation", "This payroll line is already marked paid.");
  }

  const period = await getPayrollPeriod(firmId, existing.line.periodId);
  if (!period || period.status === "closed") {
    throw new AuthError("validation", "Cannot mark paid on a closed period.");
  }

  const db = getDb();
  let remainingDeduction = existing.line.deductionsCents;
  const advanceIds = existing.line.advanceIdsJson ?? [];

  if (remainingDeduction > 0 && advanceIds.length > 0) {
    const advances = await db
      .select()
      .from(hrSalaryAdvances)
      .where(
        and(
          eq(hrSalaryAdvances.firmId, firmId),
          inArray(hrSalaryAdvances.id, advanceIds),
        ),
      );

    // Prefer advances with monthly deduction first, then by oldest decided.
    advances.sort((a, b) => {
      const aHas = (a.monthlyDeductionCents ?? 0) > 0 ? 0 : 1;
      const bHas = (b.monthlyDeductionCents ?? 0) > 0 ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      const aTime = a.decidedAt?.getTime() ?? 0;
      const bTime = b.decidedAt?.getTime() ?? 0;
      return aTime - bTime;
    });

    for (const adv of advances) {
      if (remainingDeduction <= 0) break;
      if (adv.balanceRemainingCents <= 0) continue;
      const apply = Math.min(remainingDeduction, adv.balanceRemainingCents);
      const newBalance = adv.balanceRemainingCents - apply;
      remainingDeduction -= apply;
      await db
        .update(hrSalaryAdvances)
        .set({
          balanceRemainingCents: newBalance,
          status: newBalance <= 0 ? "closed" : adv.status,
          updatedAt: new Date(),
        })
        .where(and(eq(hrSalaryAdvances.firmId, firmId), eq(hrSalaryAdvances.id, adv.id)));
    }
  }

  const rows = await db
    .update(hrPayrollLines)
    .set({
      paidAt: new Date(),
      paidByUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(hrPayrollLines.firmId, firmId), eq(hrPayrollLines.id, lineId)))
    .returning();

  return rows[0]!;
}
