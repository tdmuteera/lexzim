import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseCashbookEntryInput } from "@/lib/finance/firm-finance-validation";
import {
  createCashbookEntry,
  getBusinessCashbookBalance,
  listCashbookEntries,
  listRecentFeePaymentsForLink,
} from "@/lib/repos/firm-finance";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeEntry(row: {
  id: string;
  entryDate: Date;
  entryType: string;
  amountCents: number;
  currency: string;
  reference: string | null;
  bankAccountLabel: string | null;
  expenseId: string | null;
  feePaymentId: string | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    entryDate: row.entryDate.toISOString(),
    entryType: row.entryType,
    amountCents: row.amountCents,
    currency: row.currency,
    reference: row.reference,
    bankAccountLabel: row.bankAccountLabel,
    expenseId: row.expenseId,
    feePaymentId: row.feePaymentId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const bankLabel = url.searchParams.get("bankAccountLabel")?.trim() || undefined;

    const [entries, balanceCents, feePayments] = await Promise.all([
      listCashbookEntries(firmId, { bankAccountLabel: bankLabel }),
      getBusinessCashbookBalance(firmId, { bankAccountLabel: bankLabel }),
      listRecentFeePaymentsForLink(firmId),
    ]);

    return jsonOk({
      bookBalanceCents: balanceCents,
      items: entries.map(serializeEntry),
      feePayments: feePayments.map((fp) => ({
        id: fp.id,
        amountCents: fp.amountCents,
        currency: fp.currency,
        paidAt: fp.paidAt.toISOString(),
        reference: fp.reference,
        invoiceId: fp.invoiceId,
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
    const input = parseCashbookEntryInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });

    const entry = await createCashbookEntry(firmId, session.id, input);

    await writeAuditLog({
      action: "business_cashbook.create",
      firmId,
      userId: session.id,
      entityType: "business_cashbook_entry",
      entityId: entry.id,
      metadata: {
        entryType: entry.entryType,
        amountCents: entry.amountCents,
        note: "Firm operating cashbook. Not trust.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ entry: serializeEntry(entry) }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
