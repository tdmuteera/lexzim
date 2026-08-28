import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { parseInvoiceApprovalAction } from "@/lib/billing/invoice-approval";
import { serializeInvoice } from "@/lib/billing/serialize";
import { clientDisplayName } from "@/lib/clients/display";
import {
  applyInvoiceApprovalAction,
  getInvoice,
  sumFeePayments,
} from "@/lib/repos/billing";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST: submit | approve | reject (pre-send gate).
 * submit → billing.manage; approve/reject → invoice.approve (includes delegation).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const body = await request.json();
    const { action, rejectionNote } = parseInvoiceApprovalAction(body);

    const session =
      action === "submit"
        ? await requirePermission("billing.manage")
        : await requirePermission("invoice.approve");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const existing = await getInvoice(firmId, id);
    if (!existing) throw new AuthError("not_found", "Invoice not found.");
    await assertInvoiceMatterAccess(session, firmId, existing.invoice.matterId);

    const result = await applyInvoiceApprovalAction(
      firmId,
      id,
      session.id,
      action,
      rejectionNote,
    );

    await writeAuditLog({
      action: `invoices.approval.${action}`,
      firmId,
      userId: session.id,
      entityType: "invoice",
      entityId: id,
      metadata: {
        from: result.previous,
        to: result.invoice.approvalState,
        invoiceNumber: result.invoice.invoiceNumber,
        rejectionNote: result.invoice.rejectionNote,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getInvoice(firmId, id);
    const paidCents = await sumFeePayments(firmId, id);

    return jsonOk({
      invoice: full
        ? serializeInvoice(full.invoice, {
            matterTitle: full.matterTitle,
            matterNumber: full.matterNumber,
            clientDisplayName: full.clientType
              ? clientDisplayName({
                  clientType: full.clientType,
                  fullName: full.clientFullName,
                  legalName: full.clientLegalName,
                  tradingName: full.clientTradingName,
                })
              : null,
            paidCents,
          })
        : serializeInvoice(result.invoice, { paidCents }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
