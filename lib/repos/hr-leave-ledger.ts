/**
 * Leave ledger: entitlement / used / pending / remaining per type per year.
 */
import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  hrLeaveEntitlements,
  hrLeaveRequests,
  hrLeaveTypes,
  hrStaffProfiles,
} from "@/lib/db/schema";
import { leaveDaysInclusive, yearBoundsUtc } from "@/lib/hr/leave";
import { ensureDefaultLeaveTypes, listLeaveTypes } from "@/lib/repos/hr-leave";

export type LeaveLedgerRow = {
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  year: number;
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

export async function upsertLeaveEntitlement(input: {
  firmId: string;
  staffProfileId: string;
  leaveTypeId: string;
  year: number;
  entitlementDays: number;
}) {
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new AuthError("validation", "year is invalid.");
  }
  if (!Number.isInteger(input.entitlementDays) || input.entitlementDays < 0 || input.entitlementDays > 365) {
    throw new AuthError("validation", "entitlementDays must be 0–365.");
  }
  await ensureDefaultLeaveTypes(input.firmId);
  const db = getDb();
  const [row] = await db
    .insert(hrLeaveEntitlements)
    .values({
      firmId: input.firmId,
      staffProfileId: input.staffProfileId,
      leaveTypeId: input.leaveTypeId,
      year: input.year,
      entitlementDays: input.entitlementDays,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        hrLeaveEntitlements.firmId,
        hrLeaveEntitlements.staffProfileId,
        hrLeaveEntitlements.leaveTypeId,
        hrLeaveEntitlements.year,
      ],
      set: {
        entitlementDays: input.entitlementDays,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Keep legacy annual column in sync when updating annual type.
  const types = await listLeaveTypes(input.firmId);
  const annual = types.find((t) => t.id === input.leaveTypeId && t.code === "annual");
  if (annual) {
    await db
      .update(hrStaffProfiles)
      .set({
        annualLeaveEntitlementDays: input.entitlementDays,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hrStaffProfiles.firmId, input.firmId),
          eq(hrStaffProfiles.id, input.staffProfileId),
        ),
      );
  }

  return row!;
}

export async function listLeaveLedger(
  firmId: string,
  staffProfileId: string,
  year?: number,
): Promise<LeaveLedgerRow[]> {
  await ensureDefaultLeaveTypes(firmId);
  const y = year ?? new Date().getUTCFullYear();
  const { from: start, to: end } = yearBoundsUtc(y);
  const db = getDb();

  const types = await listLeaveTypes(firmId, { activeOnly: true });
  const entitlements = await db
    .select()
    .from(hrLeaveEntitlements)
    .where(
      and(
        eq(hrLeaveEntitlements.firmId, firmId),
        eq(hrLeaveEntitlements.staffProfileId, staffProfileId),
        eq(hrLeaveEntitlements.year, y),
      ),
    );
  const entByType = new Map(entitlements.map((e) => [e.leaveTypeId, e.entitlementDays]));

  const requests = await db
    .select({
      leaveTypeId: hrLeaveRequests.leaveTypeId,
      status: hrLeaveRequests.status,
      fromDate: hrLeaveRequests.fromDate,
      toDate: hrLeaveRequests.toDate,
    })
    .from(hrLeaveRequests)
    .where(
      and(
        eq(hrLeaveRequests.firmId, firmId),
        eq(hrLeaveRequests.staffProfileId, staffProfileId),
        sql`${hrLeaveRequests.fromDate} <= ${end}`,
        sql`${hrLeaveRequests.toDate} >= ${start}`,
      ),
    );

  // Legacy annual fallback when no entitlement row.
  const staff = await db
    .select({ annual: hrStaffProfiles.annualLeaveEntitlementDays })
    .from(hrStaffProfiles)
    .where(and(eq(hrStaffProfiles.firmId, firmId), eq(hrStaffProfiles.id, staffProfileId)))
    .limit(1);

  return types.map((t) => {
    let entitlement = entByType.get(t.id) ?? 0;
    if (t.code === "annual" && !entByType.has(t.id) && staff[0]?.annual != null) {
      entitlement = staff[0].annual;
    }
    let used = 0;
    let pending = 0;
    for (const r of requests) {
      if (r.leaveTypeId !== t.id) continue;
      const days = leaveDaysInclusive(r.fromDate, r.toDate);
      if (r.status === "approved") used += days;
      if (r.status === "requested") pending += days;
    }
    return {
      leaveTypeId: t.id,
      leaveTypeCode: t.code,
      leaveTypeName: t.name,
      year: y,
      entitlementDays: entitlement,
      usedDays: used,
      pendingDays: pending,
      remainingDays: entitlement - used - pending,
    };
  });
}

export async function notifyLeaveApprovers(input: {
  firmId: string;
  requestId: string;
  staffName: string;
  excludeUserId?: string | null;
}) {
  const { listUsersWithPermissionCode } = await import("@/lib/hr/approver-users");
  const { createStaffNotification } = await import("@/lib/notifications/staff");
  const ids = await listUsersWithPermissionCode(input.firmId, "leave.approve");
  const targets = ids.filter((id) => id !== input.excludeUserId);
  const href = "/hr/leave";
  const title = `Leave request from ${input.staffName}`;
  const body = "Please approve or reject. Approval is discretionary.";
  if (targets.length === 0) {
    await createStaffNotification({
      firmId: input.firmId,
      userId: null,
      type: "leave.approval_pending",
      title,
      body,
      href,
      metadata: { requestId: input.requestId },
    });
    return;
  }
  await Promise.all(
    targets.map((userId) =>
      createStaffNotification({
        firmId: input.firmId,
        userId,
        type: "leave.approval_pending",
        title,
        body,
        href,
        metadata: { requestId: input.requestId },
      }),
    ),
  );
}
