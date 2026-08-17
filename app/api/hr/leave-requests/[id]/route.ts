import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { leaveDaysInclusive } from "@/lib/hr/leave";
import { parseLeaveDecisionInput } from "@/lib/hr/validation";
import { getStaffProfileByUserId } from "@/lib/repos/hr";
import { decideLeaveRequest, getLeaveRequest } from "@/lib/repos/hr-leave";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

function serializeRequest(row: NonNullable<Awaited<ReturnType<typeof getLeaveRequest>>>) {
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

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getLeaveRequest(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Leave request not found.");
    }
    return jsonOk({ request: serializeRequest(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const canManage = hasPermission(session, "hr.manage");
    const { id } = await context.params;
    const existing = await getLeaveRequest(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Leave request not found.");
    }

    const body = await request.json();
    const input = parseLeaveDecisionInput(body);

    if (input.status === "approved" || input.status === "rejected") {
      if (!canManage) {
        throw new AuthError("forbidden", "Only HR managers can approve or reject leave.");
      }
    } else if (input.status === "cancelled") {
      const self = await getStaffProfileByUserId(firmId, session.id);
      const isOwner = existing.request.createdBy === session.id;
      const isSelfStaff = self?.profile.id === existing.request.staffProfileId;
      if (!canManage && !isOwner && !isSelfStaff) {
        throw new AuthError("forbidden", "You cannot cancel this leave request.");
      }
    }

    const updated = await decideLeaveRequest(firmId, id, session.id, input);
    if (!updated) {
      throw new AuthError("not_found", "Leave request not found.");
    }

    await writeAuditLog({
      action: `hr_leave.${input.status}`,
      firmId,
      userId: session.id,
      entityType: "hr_leave_request",
      entityId: id,
      metadata: {
        status: input.status,
        decisionNotes: input.decisionNotes,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getLeaveRequest(firmId, id);
    return jsonOk({ request: full ? serializeRequest(full) : null });
  } catch (err) {
    return jsonError(err, request);
  }
}
