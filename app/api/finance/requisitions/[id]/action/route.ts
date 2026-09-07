import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseRequisitionAction } from "@/lib/finance/requisition-validation";
import {
  approveRequisition,
  cancelRequisition,
  getRequisition,
  payRequisition,
  rejectRequisition,
  settleRecoverableRequisition,
  submitRequisition,
} from "@/lib/repos/requisitions";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

function serialize(row: NonNullable<Awaited<ReturnType<typeof getRequisition>>>) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    clientId: row.clientId,
    clientName: row.clientName,
    matterId: row.matterId,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    nature: row.nature,
    description: row.description,
    amountCents: row.amountCents,
    currency: row.currency,
    paidFrom: row.paidFrom,
    recoverable: row.recoverable,
    expenseId: row.expenseId,
    disbursementId: row.disbursementId,
    rejectionNote: row.rejectionNote,
    statusUpdatedAt: row.updatedAt.toISOString(),
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { action, rejectionNote, pay } = parseRequisitionAction(body);

    let session;
    if (action === "submit" || action === "cancel") {
      session = await requirePermission("finance.requisitions.request");
    } else if (action === "approve" || action === "reject") {
      session = await requirePermission("finance.requisitions.approve");
    } else {
      session = await requirePermission("finance.requisitions.pay");
    }
    const firmId = tenantFirmId(session);

    const before = await getRequisition(firmId, id);
    if (!before) throw new AuthError("not_found", "Requisition not found.");

    const isMp = session.role.code === "managing_partner";
    let result;
    let trustShortfallWarning: string | null = null;

    if (action === "submit") {
      result = await submitRequisition(firmId, session.id, id);
    } else if (action === "approve") {
      result = await approveRequisition(firmId, session.id, id, {
        isManagingPartner: isMp,
      });
    } else if (action === "reject") {
      result = await rejectRequisition(firmId, session.id, id, rejectionNote);
    } else if (action === "cancel") {
      result = await cancelRequisition(firmId, session.id, id);
    } else if (action === "settle_recoverable") {
      result = await settleRecoverableRequisition(firmId, session.id, id);
    } else {
      if (!pay) throw new AuthError("validation", "Pay payload required.");
      const paid = await payRequisition(firmId, session.id, id, pay, {
        isManagingPartner: isMp,
      });
      result = paid.requisition;
      trustShortfallWarning = paid.trustShortfallWarning;
    }

    if (!result) throw new AuthError("server", "Requisition action failed.");

    await writeAuditLog({
      action: `finance_requisitions.${action}`,
      firmId,
      userId: session.id,
      entityType: "finance_requisition",
      entityId: id,
      metadata: {
        from: before.status,
        to: result.status,
        type: result.type,
        amountCents: result.amountCents,
        paidFrom: result.paidFrom,
        recoverable: result.recoverable,
        rejectionNote,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      requisition: serialize(result),
      trustShortfallWarning,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
