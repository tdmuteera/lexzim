import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { serializeFeePayment } from "@/lib/billing/serialize";
import { parseFeePaymentInput } from "@/lib/billing/validation";
import { createFeePayment, getInvoice } from "@/lib/repos/billing";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id: invoiceId } = await context.params;

    const existing = await getInvoice(firmId, invoiceId);
    if (!existing) {
      throw new AuthError("not_found", "Invoice not found.");
    }

    await assertInvoiceMatterAccess(session, firmId, existing.invoice.matterId);

    const body = await request.json();
    const input = parseFeePaymentInput(body, {
      currency: existing.invoice.currency,
    });

    const payment = await createFeePayment(firmId, session.id, invoiceId, input);

    await writeAuditLog({
      action: "fee_payments.create",
      firmId,
      userId: session.id,
      entityType: "fee_payment",
      entityId: payment.id,
      metadata: {
        invoiceId,
        amountCents: payment.amountCents,
        currency: payment.currency,
        receiptNumber: payment.receiptNumber,
        note: "Fee receipt with GL posting Dr cash Cr AR.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ payment: serializeFeePayment(payment) }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
