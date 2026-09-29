import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { serializeFeePayment } from "@/lib/billing/serialize";
import { getInvoice } from "@/lib/repos/billing";
import { reverseFeePayment } from "@/lib/repos/finance-movements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

/** POST /api/invoices/:id/payments/:paymentId/reverse { reason } */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id: invoiceId, paymentId } = await context.params;
    const existing = await getInvoice(firmId, invoiceId);
    if (!existing) throw new AuthError("not_found", "Invoice not found.");
    await assertInvoiceMatterAccess(session, firmId, existing.invoice.matterId);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const result = await reverseFeePayment(firmId, session.id, paymentId, reason, invoiceId);

    await writeAuditLog({
      action: "fee_payments.reverse",
      firmId,
      userId: session.id,
      entityType: "fee_payment",
      entityId: paymentId,
      metadata: {
        invoiceId,
        reason,
        reversalId: result.reversal.id,
        amountCents: result.original.amountCents,
        receiptNumber: result.original.receiptNumber,
        invoiceStatus: result.invoiceStatus,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ reversal: serializeFeePayment(result.reversal), invoiceStatus: result.invoiceStatus }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
