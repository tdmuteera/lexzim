import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { leaveDaysInclusive } from "@/lib/hr/leave";
import { parseLeaveRequestInput } from "@/lib/hr/validation";
import { getStaffProfileByUserId } from "@/lib/repos/hr";
import {
  createLeaveRequest,
  getAnnualLeaveBalance,
  getLeaveRequest,
  listAwayInPeriod,
  listLeaveRequests,
} from "@/lib/repos/hr-leave";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: string | null, field: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `Invalid ${field}.`);
  }
  return d;
}

function serializeRequest(row: Awaited<ReturnType<typeof listLeaveRequests>>[number]) {
  const days = leaveDaysInclusive(row.request.fromDate, row.request.toDate);
  return {
    id: row.request.id,
    staffProfileId: row.request.staffProfileId,
    staffName: row.staffName,
    leaveTypeId: row.request.leaveTypeId,
    leaveTypeName: row.leaveTypeName,
    leaveTypeCode: row.leaveTypeCode,
    fromDate: row.request.fromDate.toISOString(),
    toDate: row.request.toDate.toISOString(),
    days,
    status: row.request.status,
    notes: row.request.notes,
    decisionNotes: row.request.decisionNotes,
    approverUserId: row.request.approverUserId,
    approverName: row.approverName,
    approvedAt: row.request.approvedAt?.toISOString() ?? null,
    createdBy: row.request.createdBy,
    createdAt: row.request.createdAt.toISOString(),
  };
}

/**
 * GET /api/hr/leave-requests?staffProfileId=&status=&from=&to=&away=1
 * POST /api/hr/leave-requests
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const away = url.searchParams.get("away") === "1";
    const from = parseDate(url.searchParams.get("from"), "from");
    const to = parseDate(url.searchParams.get("to"), "to");

    if (away) {
      if (!from || !to) {
        throw new AuthError("validation", "from and to are required for away list.");
      }
      const rows = await listAwayInPeriod(firmId, from, to);
      return jsonOk({
        from: from.toISOString(),
        to: to.toISOString(),
        items: rows.map(serializeRequest),
      });
    }

    const staffProfileId = url.searchParams.get("staffProfileId")?.trim() || undefined;
    const status = url.searchParams.get("status")?.trim() || undefined;
    const rows = await listLeaveRequests(firmId, {
      staffProfileId,
      status,
      from,
      to,
    });

    const balanceYear = Number(url.searchParams.get("balanceYear"));
    let annualBalance: Awaited<ReturnType<typeof getAnnualLeaveBalance>> | null = null;
    if (staffProfileId && Number.isInteger(balanceYear) && balanceYear > 2000) {
      annualBalance = await getAnnualLeaveBalance(firmId, staffProfileId, balanceYear);
    }

    const selfProfile = await getStaffProfileByUserId(firmId, session.id);

    return jsonOk({
      items: rows.map(serializeRequest),
      selfStaffProfileId: selfProfile?.profile.id ?? null,
      annualBalance,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const canManage = hasPermission(session, "hr.manage");
    const body = await request.json();
    const input = parseLeaveRequestInput(body);

    if (!canManage) {
      const self = await getStaffProfileByUserId(firmId, session.id);
      if (!self || self.profile.id !== input.staffProfileId) {
        throw new AuthError("forbidden", "You can only submit leave for your own HR profile.");
      }
    }

    const leave = await createLeaveRequest(firmId, session.id, input);

    await writeAuditLog({
      action: "hr_leave.create",
      firmId,
      userId: session.id,
      entityType: "hr_leave_request",
      entityId: leave.id,
      metadata: {
        staffProfileId: leave.staffProfileId,
        leaveTypeId: leave.leaveTypeId,
        fromDate: leave.fromDate.toISOString(),
        toDate: leave.toDate.toISOString(),
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getLeaveRequest(firmId, leave.id);
    return jsonOk(
      { request: full ? serializeRequest(full) : null },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
