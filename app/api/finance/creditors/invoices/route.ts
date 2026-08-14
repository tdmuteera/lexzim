import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import { createCreditorInvoice, listCreditorInvoices } from "@/lib/repos/creditors";
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

function parseOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", "Invalid due date.");
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

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const creditorId = url.searchParams.get("creditorId")?.trim() || undefined;
    const status = url.searchParams.get("status")?.trim() || undefined;

    const rows = await listCreditorInvoices(firmId, { creditorId, status });
    return jsonOk({
      items: rows.map((r) => ({
        id: r.invoice.id,
        creditorId: r.invoice.creditorId,
        creditorName: r.creditorName,
        invoiceDate: r.invoice.invoiceDate.toISOString(),
        dueDate: r.invoice.dueDate?.toISOString() ?? null,
        amountCents: r.invoice.amountCents,
        currency: r.invoice.currency,
        status: r.invoice.status,
        reference: r.invoice.reference,
        expenseAccountId: r.invoice.expenseAccountId,
        notes: r.invoice.notes,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid payload.");
    }
    const raw = body as Record<string, unknown>;
    const creditorId = typeof raw.creditorId === "string" ? raw.creditorId.trim() : "";
    if (!creditorId) throw new AuthError("validation", "creditorId is required.");

    const invoice = await createCreditorInvoice(firmId, session.id, {
      creditorId,
      invoiceDate: parseDate(raw.invoiceDate, "Invoice date"),
      dueDate: parseOptionalDate(raw.dueDate),
      amountCents: parsePositiveCents(raw),
      currency:
        typeof raw.currency === "string"
          ? raw.currency
          : session.firm.defaultCurrency || "USD",
      reference: typeof raw.reference === "string" ? raw.reference.trim() || null : null,
      expenseAccountId:
        typeof raw.expenseAccountId === "string" ? raw.expenseAccountId.trim() || null : null,
      notes: typeof raw.notes === "string" ? raw.notes.trim() || null : null,
    });

    await writeAuditLog({
      action: "creditor_invoices.create",
      firmId,
      userId: session.id,
      entityType: "creditor_invoice",
      entityId: invoice.id,
      metadata: { creditorId, amountCents: invoice.amountCents },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ invoice: { id: invoice.id } }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
