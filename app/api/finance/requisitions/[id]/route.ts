import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getRequisition, getRequisitionPayPreview } from "@/lib/repos/requisitions";
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
    clientNumber: row.clientNumber,
    matterId: row.matterId,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    nature: row.nature,
    description: row.description,
    amountCents: row.amountCents,
    currency: row.currency,
    requestedBy: row.requestedBy,
    requesterName: row.requesterName,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    rejectionNote: row.rejectionNote,
    paidAt: row.paidAt?.toISOString() ?? null,
    paidBy: row.paidBy,
    paymentRef: row.paymentRef,
    paidFrom: row.paidFrom,
    recoverable: row.recoverable,
    expenseId: row.expenseId,
    disbursementId: row.disbursementId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.requisitions.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const url = new URL(request.url);
    const preview = url.searchParams.get("preview") === "pay";

    if (preview) {
      const data = await getRequisitionPayPreview(firmId, id);
      return jsonOk({
        requisition: serialize(data.requisition),
        trustBalanceCents: data.trustBalanceCents,
        shortfallCents: data.shortfallCents,
        shortfall: data.shortfall,
        approvalTier: data.approvalTier,
      });
    }

    const row = await getRequisition(firmId, id);
    if (!row) throw new AuthError("not_found", "Requisition not found.");
    return jsonOk({ requisition: serialize(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}
