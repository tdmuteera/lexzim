import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import { payCreditorInvoice } from "@/lib/repos/creditors";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthError("validation", `${label} is required.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return d;
}

function parsePositiveCents(raw: Record<string, unknown>): number {
  if ("amountCents" in raw && raw.amountCents != null && raw.amountCents !== "") {
    const n = Number(raw.amountCents);
    if (!Number.isInteger(n) || n < 1) {
      throw new AuthError("validation", "amountCents must be a positive integer.");
    }
    return n;
  }
  const dollars = dollarsToCents(raw.amount ?? raw.amountDollars);
  if (dollars == null || dollars < 1) {
    throw new AuthError("validation", "Amount must be greater than zero.");
  }
  return dollars;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id: invoiceId } = await context.params;
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid payload.");
    }
    const raw = body as Record<string, unknown>;

    const payment = await payCreditorInvoice(firmId, session.id, invoiceId, {
      amountCents: parsePositiveCents(raw),
      currency:
        typeof raw.currency === "string"
          ? raw.currency
          : session.firm.defaultCurrency || "USD",
      paidAt: parseDate(raw.paidAt, "Paid at"),
      paymentMethod:
        typeof raw.paymentMethod === "string" ? raw.paymentMethod.trim() || null : null,
      reference: typeof raw.reference === "string" ? raw.reference.trim() || null : null,
    });

    await writeAuditLog({
      action: "creditor_payments.create",
      firmId,
      userId: session.id,
      entityType: "creditor_payment",
      entityId: payment.id,
      metadata: { invoiceId, amountCents: payment.amountCents },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ payment: { id: payment.id } }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
