import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import { quoteStatusLabel } from "@/lib/quotes/totals";
import { getQuotation } from "@/lib/repos/quotations";

export async function quotationToExportDocument(
  firmId: string,
  quotationId: string,
): Promise<ExportDocument> {
  const row = await getQuotation(firmId, quotationId);
  if (!row) {
    throw new Error("Quotation not found.");
  }

  const validUntil = row.quote.validUntil
    ? new Date(row.quote.validUntil).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "n/a";

  return {
    title: `Quotation ${row.quote.quoteNumber}`,
    subtitle: row.clientDisplayLabel,
    summaryLines: [
      `Status: ${quoteStatusLabel(row.quote.status)}`,
      `Valid until: ${validUntil}`,
      `Subtotal: ${centsToDisplay(row.subtotalCents, row.quote.currency)}`,
      row.discountAppliedCents
        ? `Discount: ${centsToDisplay(row.discountAppliedCents, row.quote.currency)}`
        : "",
      `Total: ${centsToDisplay(row.totalCents, row.quote.currency)}`,
    ].filter(Boolean),
    columns: [
      { key: "description", header: "Description" },
      { key: "qty", header: "Qty", align: "right" },
      { key: "unit", header: "Unit price", align: "right" },
      { key: "total", header: "Line total", align: "right" },
    ],
    rows: row.lines.map((l) => ({
      description: l.description,
      qty: String(l.qty),
      unit: centsToDisplay(l.unitPriceCents, row.quote.currency),
      total: centsToDisplay(l.lineTotalCents, row.quote.currency),
    })),
    note: row.quote.notes ?? undefined,
  };
}
