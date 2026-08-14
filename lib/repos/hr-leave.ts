/**
 * HR leave types and requests (Phase 6 P6-13).
 */
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  hrLeaveRequests,
  hrLeaveTypes,
  hrStaffProfiles,
  users,
} from "@/lib/db/schema";
import {
  DEFAULT_LEAVE_TYPES,
  leaveDaysInclusive,
  yearBoundsUtc,
  type LeaveRequestStatus,
} from "@/lib/hr/leave";
import type { LeaveDecisionInput, LeaveRequestInput } from "@/lib/hr/validation";
import { getStaffProfile } from "@/lib/repos/hr";

export async function ensureDefaultLeaveTypes(firmId: string) {
  const db = getDb();
  const existing = await db
    .select({ id: hrLeaveTypes.id })
    .from(hrLeaveTypes)
    .where(eq(hrLeaveTypes.firmId, firmId))
    .limit(1);
  if (existing[0]) return;

  await db.insert(hrLeaveTypes).values(
    DEFAULT_LEAVE_TYPES.map((t) => ({
      firmId,
      code: t.code,
      name: t.name,
      isPaid: t.isPaid,
      isActive: true,
    })),
  );
}

export async function listLeaveTypes(firmId: string, opts?: { activeOnly?: boolean }) {
  await ensureDefaultLeaveTypes(firmId);
  const db = getDb();
  const conditions = [eq(hrLeaveTypes.firmId, firmId)];
  if (opts?.activeOnly) {
    conditions.push(eq(hrLeaveTypes.isActive, true));
  }
  return db
    .select()
    .from(hrLeaveTypes)
    .where(and(...conditions))
    .orderBy(asc(hrLeaveTypes.name));
}

export async function createLeaveType(
  firmId: string,
  input: { code: string; name: string; isPaid: boolean },
) {
  const db = getDb();
  const rows = await db
    .insert(hrLeaveTypes)
    .values({
      firmId,
      code: input.code.trim().toLowerCase().replace(/\s+/g, "_"),
      name: input.name.trim(),
      isPaid: input.isPaid,
      isActive: true,
    })
    .returning();
  return rows[0]!;
}

export async function listLeaveRequests(
  firmId: string,
  opts?: {
    staffProfileId?: string;
    status?: string;
    from?: Date;
    to?: Date;
  },
) {
  const db = getDb();
  const conditions = [eq(hrLeaveRequests.firmId, firmId)];
  if (opts?.staffProfileId) {
    conditions.push(eq(hrLeaveRequests.staffProfileId, opts.staffProfileId));
  }
  if (opts?.status) {
    conditions.push(eq(hrLeaveRequests.status, opts.status));
  }
  if (opts?.from) {
    conditions.push(gte(hrLeaveRequests.toDate, opts.from));
  }
  if (opts?.to) {
    conditions.push(lte(hrLeaveRequests.fromDate, opts.to));
  }

  return db
    .select({
      request: hrLeaveRequests,
      staffName: hrStaffProfiles.fullName,
      leaveTypeName: hrLeaveTypes.name,
      leaveTypeCode: hrLeaveTypes.code,
      approverName: users.fullName,
    })
    .from(hrLeaveRequests)
    .innerJoin(
      hrStaffProfiles,
      and(eq(hrStaffProfiles.id, hrLeaveRequests.staffProfileId), eq(hrStaffProfiles.firmId, firmId)),
    )
    .innerJoin(hrLeaveTypes, eq(hrLeaveTypes.id, hrLeaveRequests.leaveTypeId))
    .leftJoin(users, eq(users.id, hrLeaveRequests.approverUserId))
    .where(and(...conditions))
    .orderBy(desc(hrLeaveRequests.fromDate), desc(hrLeaveRequests.createdAt));
}

export async function getLeaveRequest(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      request: hrLeaveRequests,
      staffName: hrStaffProfiles.fullName,
      leaveTypeName: hrLeaveTypes.name,
      leaveTypeCode: hrLeaveTypes.code,
      approverName: users.fullName,
    })
    .from(hrLeaveRequests)
    .innerJoin(
      hrStaffProfiles,
      and(eq(hrStaffProfiles.id, hrLeaveRequests.staffProfileId), eq(hrStaffProfiles.firmId, firmId)),
    )
    .innerJoin(hrLeaveTypes, eq(hrLeaveTypes.id, hrLeaveRequests.leaveTypeId))
    .leftJoin(users, eq(users.id, hrLeaveRequests.approverUserId))
    .where(and(eq(hrLeaveRequests.firmId, firmId), eq(hrLeaveRequests.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createLeaveRequest(
  firmId: string,
  userId: string,
  input: LeaveRequestInput,
) {
  const staff = await getStaffProfile(firmId, input.staffProfileId);
  if (!staff) {
    throw new AuthError("validation", "Staff record not found.");
  }

  const types = await listLeaveTypes(firmId, { activeOnly: true });
  const type = types.find((t) => t.id === input.leaveTypeId);
  if (!type) {
    throw new AuthError("validation", "Leave type not found.");
  }

  if (input.toDate.getTime() < input.fromDate.getTime()) {
    throw new AuthError("validation", "End date must be on or after start date.");
  }

  const db = getDb();
  const rows = await db
    .insert(hrLeaveRequests)
    .values({
      firmId,
      staffProfileId: input.staffProfileId,
      leaveTypeId: input.leaveTypeId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      status: "requested",
      notes: input.notes,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function decideLeaveRequest(
  firmId: string,
  id: string,
  approverUserId: string,
  input: LeaveDecisionInput,
) {
  const existing = await getLeaveRequest(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Leave request not found.");
  }

  const current = existing.request.status as LeaveRequestStatus;
  if (input.status === "approved" || input.status === "rejected") {
    if (current !== "requested") {
      throw new AuthError("validation", "Only requested leave can be approved or rejected.");
    }
  } else if (input.status === "cancelled") {
    if (current === "cancelled" || current === "rejected") {
      throw new AuthError("validation", "This leave request cannot be cancelled.");
    }
  }

  const db = getDb();
  const rows = await db
    .update(hrLeaveRequests)
    .set({
      status: input.status,
      decisionNotes: input.decisionNotes,
      approverUserId:
        input.status === "approved" || input.status === "rejected" ? approverUserId : null,
      approvedAt:
        input.status === "approved" || input.status === "rejected" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(hrLeaveRequests.firmId, firmId), eq(hrLeaveRequests.id, id)))
    .returning();
  return rows[0] ?? null;
}

/** Approved leave overlapping a window (who is away). */
export async function listAwayInPeriod(firmId: string, from: Date, to: Date) {
  return listLeaveRequests(firmId, { status: "approved", from, to });
}

export async function sumAnnualLeaveTakenDays(
  firmId: string,
  staffProfileId: string,
  year: number,
): Promise<number> {
  const { from, to } = yearBoundsUtc(year);
  const rows = await listLeaveRequests(firmId, {
    staffProfileId,
    status: "approved",
    from,
    to,
  });

  let total = 0;
  for (const row of rows) {
    if (row.leaveTypeCode !== "annual") continue;
    total += leaveDaysInclusive(row.request.fromDate, row.request.toDate);
  }
  return total;
}

export async function getAnnualLeaveBalance(
  firmId: string,
  staffProfileId: string,
  year: number,
) {
  const staff = await getStaffProfile(firmId, staffProfileId);
  if (!staff) {
    throw new AuthError("not_found", "Staff record not found.");
  }
  const entitled = staff.profile.annualLeaveEntitlementDays;
  const taken = await sumAnnualLeaveTakenDays(firmId, staffProfileId, year);
  return {
    year,
    entitledDays: entitled,
    takenDays: taken,
    remainingDays: entitled != null ? entitled - taken : null,
  };
}
