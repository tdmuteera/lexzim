import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { leaveDaysInclusive } from "@/lib/hr/leave";
import { parseLeaveDecisionInput } from "@/lib/hr/validation";
import { createStaffNotification } from "@/lib/notifications/staff";
import { getStaffProfileByUserId } from "@/lib/repos/hr";
import { decideLeaveRequest, getLeaveRequest } from "@/lib/repos/hr-leave";
import { hasAnyPermission, hasPermission, requireAny } from "@/lib/rbac/guards";
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

async function assertCanViewLeaveRequest(
  session: Awaited<ReturnType<typeof requireAny>>,
  firmId: string,
  row: NonNullable<Awaited<ReturnType<typeof getLeaveRequest>>>,
) {
  if (hasAnyPermission(session, ["hr.view", "leave.approve", "hr.manage"])) {
    return;
  }
  const self = await getStaffProfileByUserId(firmId, session.id);
  const isOwner = row.request.createdBy === session.id;
  const isSelfStaff = self?.profile.id === row.request.staffProfileId;
  if (!isOwner && !isSelfStaff) {
    throw new AuthError("forbidden", "You cannot view this leave request.");
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requireAny([
      "hr.view",
      "hr.leave.request",
      "leave.approve",
    ]);
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getLeaveRequest(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Leave request not found.");
    }
    await assertCanViewLeaveRequest(session, firmId, row);
    return jsonOk({ request: serializeRequest(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAny([
      "hr.view",
      "hr.leave.request",
      "leave.approve",
      "hr.manage",
    ]);
    const firmId = tenantFirmId(session);
    const canManage = hasPermission(session, "hr.manage");
    const { id } = await context.params;
    const existing = await getLeaveRequest(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Leave request not found.");
    }

    const body = await request.json();
    const input = parseLeaveDecisionInput(body);

    const canApproveLeave = hasAnyPermission(session, ["leave.approve", "hr.manage"]);

    if (input.status === "approved" || input.status === "rejected") {
      if (!canApproveLeave) {
        throw new AuthError(
          "forbidden",
          "Leave approval requires leave.approve or hr.manage.",
        );
      }
    } else if (input.status === "cancelled") {
      const self = await getStaffProfileByUserId(firmId, session.id);
      const isOwner = existing.request.createdBy === session.id;
      const isSelfStaff = self?.profile.id === existing.request.staffProfileId;
      if (!canManage && !isOwner && !isSelfStaff) {
        throw new AuthError("forbidden", "You cannot cancel this leave request.");
      }
    } else {
      throw new AuthError("forbidden", "Unsupported leave status update.");
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

    if (
      (input.status === "approved" || input.status === "rejected") &&
      existing.request.createdBy &&
      existing.request.createdBy !== session.id
    ) {
      await createStaffNotification({
        firmId,
        userId: existing.request.createdBy,
        type:
          input.status === "approved"
            ? "leave.approval_approved"
            : "leave.approval_rejected",
        title:
          input.status === "approved"
            ? `Leave request approved (${existing.staffName})`
            : `Leave request rejected (${existing.staffName})`,
        body:
          input.status === "approved"
            ? "Your leave request was approved. Approval is discretionary."
            : input.decisionNotes ||
              "Your leave request was not approved. Approval is discretionary.",
        href: "/hr/leave",
        metadata: { requestId: id, status: input.status },
      });
    }

    const full = await getLeaveRequest(firmId, id);
    return jsonOk({ request: full ? serializeRequest(full) : null });
  } catch (err) {
    return jsonError(err, request);
  }
}
