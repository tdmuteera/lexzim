import type { quotations, quotationLines } from "@/lib/db/schema";
import { quoteStatusLabel } from "@/lib/quotes/totals";
import { centsToDisplay } from "@/lib/billing/money";

type QuoteRow = typeof quotations.$inferSelect;
type LineRow = typeof quotationLines.$inferSelect;

export function serializeQuotationListItem(row: {
  quote: QuoteRow;
  clientDisplayLabel: string;
  matterTitle: string | null;
  matterNumber: string | null;
  subtotalCents: number;
  discountAppliedCents: number;
  totalCents: number;
}) {
  return {
    id: row.quote.id,
    quoteNumber: row.quote.quoteNumber,
    status: row.quote.status,
    statusLabel: quoteStatusLabel(row.quote.status),
    currency: row.quote.currency,
    clientId: row.quote.clientId,
    clientDisplayLabel: row.clientDisplayLabel,
    matterId: row.quote.matterId,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    validUntil: row.quote.validUntil?.toISOString() ?? null,
    subtotalCents: row.subtotalCents,
    discountAppliedCents: row.discountAppliedCents,
    totalCents: row.totalCents,
    createdAt: row.quote.createdAt.toISOString(),
    updatedAt: row.quote.updatedAt.toISOString(),
  };
}

export function serializeQuotationDetail(row: {
  quote: QuoteRow;
  lines: LineRow[];
  clientDisplayLabel: string;
  clientNumber: string;
  clientEmail?: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
  subtotalCents: number;
  discountAppliedCents: number;
  totalCents: number;
}) {
  return {
    ...serializeQuotationListItem(row),
    clientNumber: row.clientNumber,
    clientEmail: row.clientEmail?.trim() || null,
    discountCents: row.quote.discountCents,
    discountPct: row.quote.discountPct,
    notes: row.quote.notes,
    lines: row.lines.map((l) => ({
      id: l.id,
      firmServiceId: l.firmServiceId,
      description: l.description,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
      unitPriceDisplay: centsToDisplay(l.unitPriceCents, row.quote.currency),
      lineTotalDisplay: centsToDisplay(l.lineTotalCents, row.quote.currency),
    })),
    subtotalDisplay: centsToDisplay(row.subtotalCents, row.quote.currency),
    discountDisplay: centsToDisplay(row.discountAppliedCents, row.quote.currency),
    totalDisplay: centsToDisplay(row.totalCents, row.quote.currency),
  };
}
