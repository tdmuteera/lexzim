import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { dollarsToCents } from "@/lib/billing/money";
import { postApplyRetainerGl } from "@/lib/gl/posting-invoices";
import { getInvoice, sumFeePayments } from "@/lib/repos/billing";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

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
      throw new AuthError("validation", "Retainer can only be applied to sent or paid invoices.");
    }

    let amountCents: number | null = null;
    if (body && typeof body === "object") {
      const raw = body as Record<string, unknown>;
      if (raw.amountCents != null) amountCents = Number(raw.amountCents);
      else amountCents = dollarsToCents(raw.amountDollars);
    }
    if (amountCents == null || !Number.isInteger(amountCents) || amountCents < 1) {
      throw new AuthError("validation", "Retainer amount is required.");
    }

    const paid = await sumFeePayments(firmId, invoiceId);
    const balance = existing.invoice.totalCents - paid - existing.invoice.retainerAppliedCents;
    if (amountCents > balance) {
      throw new AuthError("validation", "Retainer amount exceeds invoice balance.");
    }

    await postApplyRetainerGl(firmId, session.id, invoiceId, amountCents);

    await writeAuditLog({
      action: "invoices.apply_retainer",
      firmId,
      userId: session.id,
      entityType: "invoice",
      entityId: invoiceId,
      metadata: { amountCents },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ ok: true, amountCents });
  } catch (err) {
    return jsonError(err);
  }
}
