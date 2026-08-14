/** Quotation totals and discount helpers (Phase 7). */

export function lineTotalCents(qty: number, unitPriceCents: number): number {
  return Math.round(qty * unitPriceCents);
}

export function quotationSubtotalCents(lines: { lineTotalCents: number }[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
}

export function quotationDiscountCents(
  subtotalCents: number,
  discountCents: number,
  discountPct: number | null | undefined,
): number {
  if (discountPct != null && discountPct > 0) {
    return Math.round(subtotalCents * (discountPct / 100));
  }
  return Math.max(0, discountCents);
}

export function quotationTotalCents(
  subtotalCents: number,
  discountCents: number,
  discountPct: number | null | undefined,
): number {
  const discount = quotationDiscountCents(subtotalCents, discountCents, discountPct);
  return Math.max(0, subtotalCents - discount);
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export const QUOTE_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
];

export function isQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

export function assertQuoteStatusTransition(from: string, to: QuoteStatus): void {
  if (from === to) return;
  const allowed: Record<string, QuoteStatus[]> = {
    draft: ["sent", "declined"],
    sent: ["accepted", "declined", "expired"],
    accepted: ["declined"],
    declined: [],
    expired: [],
  };
  const next = allowed[from] ?? [];
  if (!next.includes(to)) {
    throw new Error(`Cannot change quote status from ${from} to ${to}.`);
  }
}

export function quoteStatusLabel(status: string): string {
  if (status === "draft") return "Draft";
  if (status === "sent") return "Sent";
  if (status === "accepted") return "Accepted";
  if (status === "declined") return "Declined";
  if (status === "expired") return "Expired";
  return status;
}
