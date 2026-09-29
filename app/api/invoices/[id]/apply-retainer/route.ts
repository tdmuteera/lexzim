import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { dollarsToCents } from "@/lib/billing/money";
import { getInvoice } from "@/lib/repos/billing";
import { transferTrustToFees } from "@/lib/repos/finance-movements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Settle an invoice from the client's trust funds. Writes the trust ledger debit,
 * releases the trust liability against AR and moves the cash to operating in GL.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id: invoiceId } = await context.params;
    const body = await request.json();

    const existing = await getInvoice(firmId, invoiceId);
    if (!existing) throw new AuthError("not_found", "Invoice not found.");
    await assertInvoiceMatterAccess(session, firmId, existing.invoice.matterId);

    if (existing.invoice.status === "draft" || existing.invoice.status === "void") {
      throw new AuthError("validation", "Retainer can only be applied to sent or overdue invoices.");
    }
    if (!existing.invoice.clientId) {
      throw new AuthError("validation", "Invoice has no client, so trust funds cannot be applied.");
    }

    let amountCents: number | null = null;
    let trustAccountId: string | null = null;
    let idempotencyKey: string | null = null;
    if (body && typeof body === "object") {
      const raw = body as Record<string, unknown>;
      if (raw.amountCents != null) amountCents = Number(raw.amountCents);
      else amountCents = dollarsToCents(raw.amountDollars);
      if (typeof raw.trustAccountId === "string" && raw.trustAccountId.trim()) {
        trustAccountId = raw.trustAccountId.trim();
      }
      if (typeof raw.idempotencyKey === "string" && raw.idempotencyKey.trim()) {
        idempotencyKey = raw.idempotencyKey.trim();
      }
    }
    if (amountCents == null || !Number.isInteger(amountCents) || amountCents < 1) {
      throw new AuthError("validation", "Retainer amount is required.");
    }

    const result = await transferTrustToFees(firmId, session.id, {
      clientId: existing.invoice.clientId,
      matterId: existing.invoice.matterId,
      trustAccountId,
      amountCents,
      occurredAt: new Date(),
      reference: existing.invoice.invoiceNumber,
      invoiceId,
      feeCategory: null,
      sourceType: "invoice_fee",
      idempotencyKey,
    });

    await writeAuditLog({
      action: "invoices.apply_retainer",
      firmId,
      userId: session.id,
      entityType: "invoice",
      entityId: invoiceId,
      metadata: {
        amountCents,
        trustEntryId: result.entry.id,
        trustAccountId: result.entry.trustAccountId,
        clientId: existing.invoice.clientId,
        replayed: result.replayed,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ ok: true, amountCents, trustEntryId: result.entry.id });
  } catch (err) {
    return jsonError(err, request);
  }
}
