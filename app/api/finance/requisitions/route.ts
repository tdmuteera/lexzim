import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isMissingRelationError } from "@/lib/db/missing-relation";
import { requisitionApprovalTier } from "@/lib/finance/requisition-constants";
import {
  isRequisitionStatus,
  isRequisitionType,
  parseRequisitionCreateInput,
} from "@/lib/finance/requisition-validation";
import { getClientTrustBalance } from "@/lib/repos/trust";
import {
  createRequisition,
  listRecoverableRequisitions,
  listRequisitions,
} from "@/lib/repos/requisitions";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeRequisition(row: Awaited<ReturnType<typeof listRequisitions>>[number]) {
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

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.requisitions.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const typeRaw = url.searchParams.get("type");
    const statusRaw = url.searchParams.get("status");
    const type = typeRaw && isRequisitionType(typeRaw) ? typeRaw : undefined;
    const status =
      statusRaw && isRequisitionStatus(statusRaw) ? statusRaw : undefined;
    const recoverableOnly = url.searchParams.get("recoverable") === "1";

    if (recoverableOnly) {
      const items = await listRecoverableRequisitions(firmId, {
        clientId: url.searchParams.get("clientId")?.trim() || undefined,
      });
      return jsonOk({ items: items.map(serializeRequisition), recoverableOnly: true });
    }

    const items = await listRequisitions(firmId, {
      type,
      status,
      clientId: url.searchParams.get("clientId")?.trim() || undefined,
      matterId: url.searchParams.get("matterId")?.trim() || undefined,
    });

    return jsonOk({ items: items.map(serializeRequisition) });
  } catch (err) {
    if (isMissingRelationError(err)) {
      return jsonError(
        new AuthError(
          "failed",
          "Requisitions tables are missing on this database. Run npm run db:migrate (migration 0045_phase11_finance_depth), then refresh.",
        ),
        request,
      );
    }
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.requisitions.request");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseRequisitionCreateInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });

    const row = await createRequisition(firmId, session.id, input);
    if (!row) throw new AuthError("server", "Could not load requisition after create.");

    let trustBalanceCents: number | null = null;
    if (row.type === "disbursement" && row.clientId) {
      trustBalanceCents = await getClientTrustBalance(firmId, row.clientId, {
        matterId: row.matterId ?? undefined,
      });
    }

    await writeAuditLog({
      action: "finance_requisitions.create",
      firmId,
      userId: session.id,
      entityType: "finance_requisition",
      entityId: row.id,
      metadata: {
        type: row.type,
        status: row.status,
        amountCents: row.amountCents,
        clientId: row.clientId,
        matterId: row.matterId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        requisition: serializeRequisition(row),
        approvalTier: requisitionApprovalTier({
          type: row.type as "business" | "disbursement",
          amountCents: row.amountCents,
          trustBalanceCents,
        }),
        trustBalanceCents,
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
