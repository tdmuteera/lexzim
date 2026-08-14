import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import { clientDisplayName } from "@/lib/clients/display";
import type { ExportDocument } from "@/lib/export/types";
import { getInvoice, listInvoiceLines } from "@/lib/repos/billing";
import {
  quotationDiscountCents,
} from "@/lib/quotes/totals";

export async function invoiceToExportDocument(
  firmId: string,
  invoiceId: string,
): Promise<ExportDocument> {
  const full = await getInvoice(firmId, invoiceId);
  if (!full) throw new Error("Invoice not found.");

  const lines = await listInvoiceLines(firmId, invoiceId);
  const clientLabel = full.clientType
    ? clientDisplayName({
        clientType: full.clientType,
        fullName: full.clientFullName,
        legalName: full.clientLegalName,
        tradingName: full.clientTradingName,
      })
    : "Client";

  const discountApplied = quotationDiscountCents(
    full.invoice.subtotalCents,
    full.invoice.discountCents,
    full.invoice.discountPct,
  );

  const issueDate = full.invoice.issueDate
    ? new Date(full.invoice.issueDate).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "Draft";

  return {
    title: `Invoice ${full.invoice.invoiceNumber}`,
    subtitle: clientLabel,
    summaryLines: [
      full.clientNumber ? `Client number: ${full.clientNumber}` : "",
      full.matterNumber ? `Matter: ${full.matterNumber}` : "",
      `Issue date: ${issueDate}`,
      `Subtotal: ${centsToDisplay(full.invoice.subtotalCents, full.invoice.currency)}`,
      discountApplied > 0
        ? `Discount: ${centsToDisplay(discountApplied, full.invoice.currency)}`
        : "",
      `Total: ${centsToDisplay(full.invoice.totalCents, full.invoice.currency)}`,
    ].filter(Boolean),
    columns: [
      { key: "description", header: "Description" },
      { key: "qty", header: "Qty", align: "right" },
      { key: "unit", header: "Unit", align: "right" },
      { key: "total", header: "Amount", align: "right" },
    ],
    rows: lines.map((l) => ({
      description: l.description,
      qty: String(l.quantity),
      unit: centsToDisplay(l.unitAmountCents, full.invoice.currency),
      total: centsToDisplay(l.amountCents, full.invoice.currency),
    })),
    note: full.invoice.notes ?? undefined,
  };
}
