/**
 * Salary advances (T Pfigu form fields). Not a tax engine.
 */
import "server-only";

import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { hrSalaryAdvances, hrStaffProfiles, users } from "@/lib/db/schema";
import type {
  SalaryAdvanceCreateInput,
  SalaryAdvanceDecideInput,
  SalaryAdvanceFinanceInput,
} from "@/lib/hr/validation";
import { createStaffNotification } from "@/lib/notifications/staff";
import { listUsersWithPermissionCode } from "@/lib/hr/approver-users";

const OPEN_BALANCE_STATUSES = ["submitted", "finance_reviewed", "decided", "paid"] as const;

export async function sumOutstandingAdvanceBalance(
  firmId: string,
  staffProfileId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${hrSalaryAdvances.balanceRemainingCents}), 0)`,
    })
    .from(hrSalaryAdvances)
    .where(
      and(
        eq(hrSalaryAdvances.firmId, firmId),
        eq(hrSalaryAdvances.staffProfileId, staffProfileId),
        inArray(hrSalaryAdvances.status, [...OPEN_BALANCE_STATUSES]),
        gt(hrSalaryAdvances.balanceRemainingCents, 0),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function listSalaryAdvances(
  firmId: string,
  opts?: { staffProfileId?: string; status?: string; statuses?: string[] },
) {
  const db = getDb();
  const conditions = [eq(hrSalaryAdvances.firmId, firmId)];
  if (opts?.staffProfileId) {
    conditions.push(eq(hrSalaryAdvances.staffProfileId, opts.staffProfileId));
  }
  if (opts?.statuses?.length) {
    conditions.push(inArray(hrSalaryAdvances.status, opts.statuses));
  } else if (opts?.status) {
    conditions.push(eq(hrSalaryAdvances.status, opts.status));
  }

  return db
    .select({
      advance: hrSalaryAdvances,
      staffName: hrStaffProfiles.fullName,
      preparedByName: users.fullName,
    })
    .from(hrSalaryAdvances)
    .innerJoin(hrStaffProfiles, eq(hrSalaryAdvances.staffProfileId, hrStaffProfiles.id))
    .leftJoin(users, eq(hrSalaryAdvances.preparedByUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(hrSalaryAdvances.createdAt));
}

export async function getSalaryAdvance(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      advance: hrSalaryAdvances,
      staffName: hrStaffProfiles.fullName,
      staffUserId: hrStaffProfiles.userId,
      preparedByName: users.fullName,
    })
    .from(hrSalaryAdvances)
    .innerJoin(hrStaffProfiles, eq(hrSalaryAdvances.staffProfileId, hrStaffProfiles.id))
    .leftJoin(users, eq(hrSalaryAdvances.preparedByUserId, users.id))
    .where(and(eq(hrSalaryAdvances.firmId, firmId), eq(hrSalaryAdvances.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSalaryAdvance(
  firmId: string,
  createdBy: string,
  input: SalaryAdvanceCreateInput,
) {
  const db = getDb();
  const staffRows = await db
    .select()
    .from(hrStaffProfiles)
    .where(
      and(eq(hrStaffProfiles.firmId, firmId), eq(hrStaffProfiles.id, input.staffProfileId)),
    )
    .limit(1);
  const staff = staffRows[0];
  if (!staff) {
    throw new AuthError("not_found", "Staff profile not found.");
  }
  if (!staff.isActive) {
    throw new AuthError("validation", "Cannot request an advance for inactive staff.");
  }

  const existingBalance = await sumOutstandingAdvanceBalance(firmId, input.staffProfileId);

  const rows = await db
    .insert(hrSalaryAdvances)
    .values({
      firmId,
      staffProfileId: input.staffProfileId,
      employeeName: staff.fullName,
      positionTitle: staff.jobTitle,
      department: staff.department,
      employeeNumber: staff.employeeNumber,
      applicationDate: input.applicationDate ?? new Date(),
      amountCents: input.amountCents,
      amountInWords: input.amountInWords,
      reason: input.reason,
      declarationAcceptedAt: input.declarationAcceptedAt,
      grossSalaryCents: staff.grossSalaryCents,
      netSalaryCents: staff.netSalaryCents,
      existingAdvanceBalanceCents: existingBalance,
      status: "submitted",
      balanceRemainingCents: 0,
      createdBy,
      updatedAt: new Date(),
    })
    .returning();

  return rows[0]!;
}

export async function financeReviewSalaryAdvance(
  firmId: string,
  id: string,
  preparedByUserId: string,
  input: SalaryAdvanceFinanceInput,
) {
  const existing = await getSalaryAdvance(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Salary advance not found.");
  }
  if (existing.advance.status !== "submitted" && existing.advance.status !== "finance_reviewed") {
    throw new AuthError(
      "validation",
      "Finance review is only available before a management decision.",
    );
  }

  const db = getDb();
  const rows = await db
    .update(hrSalaryAdvances)
    .set({
      grossSalaryCents: input.grossSalaryCents ?? existing.advance.grossSalaryCents,
      netSalaryCents: input.netSalaryCents ?? existing.advance.netSalaryCents,
      existingAdvanceBalanceCents:
        input.existingAdvanceBalanceCents ?? existing.advance.existingAdvanceBalanceCents,
      proposedAdvanceCents:
        input.proposedAdvanceCents ?? existing.advance.proposedAdvanceCents,
      proposedMonthlyDeductionCents:
        input.proposedMonthlyDeductionCents ??
        existing.advance.proposedMonthlyDeductionCents,
      recommendedMonths: input.recommendedMonths ?? existing.advance.recommendedMonths,
      financeNotes: input.financeNotes ?? existing.advance.financeNotes,
      preparedByUserId,
      financeReviewedAt: new Date(),
      status: "finance_reviewed",
      updatedAt: new Date(),
    })
    .where(and(eq(hrSalaryAdvances.firmId, firmId), eq(hrSalaryAdvances.id, id)))
    .returning();

  return rows[0]!;
}

export async function decideSalaryAdvance(
  firmId: string,
  id: string,
  authorisedByUserId: string,
  input: SalaryAdvanceDecideInput,
) {
  const existing = await getSalaryAdvance(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Salary advance not found.");
  }
  if (
    existing.advance.status !== "submitted" &&
    existing.advance.status !== "finance_reviewed"
  ) {
    throw new AuthError("validation", "This advance has already been decided.");
  }

  const approved =
    input.decision === "approved" || input.decision === "approved_subject_to_amendment";
  let approvedAmount = input.approvedAmountCents;
  if (approved) {
    approvedAmount =
      input.approvedAmountCents ??
      existing.advance.proposedAdvanceCents ??
      existing.advance.amountCents;
    if (approvedAmount == null || approvedAmount <= 0) {
      throw new AuthError("validation", "approvedAmountCents is required when approving.");
    }
  }

  const db = getDb();
  const rows = await db
    .update(hrSalaryAdvances)
    .set({
      decision: input.decision,
      approvedAmountCents: approved ? approvedAmount : null,
      monthlyDeductionCents: approved
        ? (input.monthlyDeductionCents ??
          existing.advance.proposedMonthlyDeductionCents)
        : null,
      repaymentMonths: approved
        ? (input.repaymentMonths ?? existing.advance.recommendedMonths)
        : null,
      effectiveDeductionDate: approved ? input.effectiveDeductionDate : null,
      managementComments: input.managementComments,
      authorisedByUserId,
      decidedAt: new Date(),
      balanceRemainingCents: approved ? approvedAmount! : 0,
      status: "decided",
      updatedAt: new Date(),
    })
    .where(and(eq(hrSalaryAdvances.firmId, firmId), eq(hrSalaryAdvances.id, id)))
    .returning();

  return rows[0]!;
}

export async function markSalaryAdvancePaid(firmId: string, id: string) {
  const existing = await getSalaryAdvance(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Salary advance not found.");
  }
  if (existing.advance.status !== "decided") {
    throw new AuthError("validation", "Only decided advances can be marked paid.");
  }
  if (
    existing.advance.decision !== "approved" &&
    existing.advance.decision !== "approved_subject_to_amendment"
  ) {
    throw new AuthError("validation", "Only approved advances can be marked paid.");
  }

  const db = getDb();
  const rows = await db
    .update(hrSalaryAdvances)
    .set({
      status: "paid",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(hrSalaryAdvances.firmId, firmId), eq(hrSalaryAdvances.id, id)))
    .returning();

  return rows[0]!;
}

export async function notifyAdvanceApprovers(input: {
  firmId: string;
  advanceId: string;
  employeeName: string;
  excludeUserId?: string | null;
}) {
  const ids = await listUsersWithPermissionCode(input.firmId, "payroll.advance.approve");
  const manageIds = await listUsersWithPermissionCode(input.firmId, "hr.manage");
  const targets = [...new Set([...ids, ...manageIds])].filter(
    (id) => id !== input.excludeUserId,
  );
  const href = "/hr/advances";
  const title = `Salary advance from ${input.employeeName}`;
  const body = "Please review and decide. Approval of salary advances is discretionary.";
  const { notifyStaffEvent } = await import("@/lib/notifications/notify-staff-event");
  await notifyStaffEvent({
    firmId: input.firmId,
    userIds: targets,
    subject: `LexZim: ${title}`,
    body,
    inApp: {
      type: "advance.approval_pending",
      title,
      body,
      href,
      metadata: { advanceId: input.advanceId },
    },
    broadcastInAppIfEmpty: true,
  });
}

export async function notifyAdvanceCreator(input: {
  firmId: string;
  creatorUserId: string | null | undefined;
  advanceId: string;
  employeeName: string;
  decision: string;
  actorUserId: string;
  comments?: string | null;
}) {
  if (!input.creatorUserId || input.creatorUserId === input.actorUserId) return;
  const approved =
    input.decision === "approved" || input.decision === "approved_subject_to_amendment";
  await createStaffNotification({
    firmId: input.firmId,
    userId: input.creatorUserId,
    type: approved ? "advance.approval_approved" : "advance.approval_rejected",
    title: approved
      ? `Salary advance approved (${input.employeeName})`
      : `Salary advance not approved (${input.employeeName})`,
    body: approved
      ? "Your salary advance was approved. Approval of salary advances is discretionary."
      : input.comments ||
        "Your salary advance was not approved. Approval of salary advances is discretionary.",
    href: "/hr/advances",
    metadata: { advanceId: input.advanceId, decision: input.decision },
  });
}
