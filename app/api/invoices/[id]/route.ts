import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import {
  serializeFeePayment,
  serializeInvoice,
  serializeInvoiceLine,
} from "@/lib/billing/serialize";
import { parseInvoiceStatus } from "@/lib/billing/validation";
import { clientDisplayName } from "@/lib/clients/display";
import {
  getInvoice,
  listFeePayments,
  listInvoiceLines,
  sumFeePayments,
  updateInvoiceStatus,
} from "@/lib/repos/billing";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const full = await getInvoice(firmId, id);
    if (!full) {
      throw new AuthError("not_found", "Invoice not found.");
    }

    await assertInvoiceMatterAccess(session, firmId, full.invoice.matterId);

    const [lines, payments, paidCents] = await Promise.all([
      listInvoiceLines(firmId, id),
      listFeePayments(firmId, id),
      sumFeePayments(firmId, id),
    ]);

    const balanceCents = Math.max(0, full.invoice.totalCents - paidCents);

    return jsonOk({
      invoice: serializeInvoice(full.invoice, {
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
        clientNumber: full.clientNumber,
        paidCents,
      }),
      lines: lines.map(serializeInvoiceLine),
      payments: payments.map((p) => serializeFeePayment(p, { balanceCents })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const status = parseInvoiceStatus(body);

    const existing = await getInvoice(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Invoice not found.");
    }

    await assertInvoiceMatterAccess(session, firmId, existing.invoice.matterId);

    const row = await updateInvoiceStatus(firmId, id, status, session.id);
    if (!row) {
      throw new AuthError("not_found", "Invoice not found.");
    }

    await writeAuditLog({
      action: "invoices.status",
      firmId,
      userId: session.id,
      entityType: "invoice",
      entityId: id,
      metadata: {
        from: existing.invoice.status,
        to: status,
        invoiceNumber: row.invoiceNumber,
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
        : serializeInvoice(row, { paidCents }),
    });
  } catch (err) {
    return jsonError(err);
  }
}
