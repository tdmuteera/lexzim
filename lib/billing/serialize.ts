import type {
  disbursements,
  feePayments,
  invoiceLines,
  invoices,
  timeEntries,
} from "@/lib/db/schema";
import { formatMinutes, centsToDisplay, timeEntryAmountCents } from "@/lib/billing/money";
import {
  quotationDiscountCents,
} from "@/lib/quotes/totals";

type TimeEntryRow = typeof timeEntries.$inferSelect;
type DisbursementRow = typeof disbursements.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceLineRow = typeof invoiceLines.$inferSelect;
type FeePaymentRow = typeof feePayments.$inferSelect;

export function serializeTimeEntry(
  row: TimeEntryRow,
  opts?: { userName?: string | null },
) {
  const amountCents = row.billable
    ? timeEntryAmountCents(row.minutes, row.rateCents)
    : null;
  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    userId: row.userId,
    userName: opts?.userName ?? null,
    workedAt: row.workedAt.toISOString(),
    minutes: row.minutes,
    billable: row.billable,
    rateCents: row.rateCents,
    currency: row.currency,
    description: row.description,
    invoiceId: row.invoiceId,
    locked: Boolean(row.invoiceId),
    amountCents,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeDisbursement(row: DisbursementRow) {
  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    description: row.description,
    amountCents: row.amountCents,
    currency: row.currency,
    incurredAt: row.incurredAt.toISOString(),
    billable: row.billable,
    billableToClient: row.billable,
    invoiceId: row.invoiceId,
    locked: Boolean(row.invoiceId),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeInvoice(
  row: InvoiceRow,
  opts?: {
    matterTitle?: string | null;
    matterNumber?: string | null;
    clientDisplayName?: string | null;
    clientNumber?: string | null;
    paidCents?: number;
    now?: Date;
  },
) {
  const now = opts?.now ?? new Date();
  const paidCents = opts?.paidCents ?? 0;
  const retainerAppliedCents = row.retainerAppliedCents ?? 0;
  const balanceCents = Math.max(0, row.totalCents - paidCents - retainerAppliedCents);
  const displayOverdue =
    (row.status === "sent" || row.status === "overdue") &&
    Boolean(row.dueDate) &&
    row.dueDate!.getTime() < now.getTime() &&
    balanceCents > 0;

  const discountAppliedCents = quotationDiscountCents(
    row.subtotalCents,
    row.discountCents,
    row.discountPct,
  );

  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    clientId: row.clientId,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    currency: row.currency,
    issueDate: row.issueDate ? row.issueDate.toISOString() : null,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    discountPct: row.discountPct,
    discountAppliedCents,
    discountDisplay: centsToDisplay(discountAppliedCents, row.currency),
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    retainerAppliedCents: row.retainerAppliedCents,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    matterTitle: opts?.matterTitle ?? null,
    matterNumber: opts?.matterNumber ?? null,
    clientDisplayName: opts?.clientDisplayName ?? null,
    clientNumber: opts?.clientNumber ?? null,
    paidCents,
    balanceCents,
    displayOverdue,
  };
}

export function serializeInvoiceLine(row: InvoiceLineRow) {
  return {
    id: row.id,
    firmId: row.firmId,
    invoiceId: row.invoiceId,
    lineType: row.lineType,
    description: row.description,
    quantity: row.quantity,
    unitAmountCents: row.unitAmountCents,
    amountCents: row.amountCents,
    sourceId: row.sourceId,
    firmServiceId: row.firmServiceId,
    revenueGlAccountId: row.revenueGlAccountId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeFeePayment(row: FeePaymentRow, opts?: { balanceCents?: number }) {
  return {
    id: row.id,
    firmId: row.firmId,
    invoiceId: row.invoiceId,
    receiptNumber: row.receiptNumber,
    amountCents: row.amountCents,
    currency: row.currency,
    paidAt: row.paidAt.toISOString(),
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    balanceCents: opts?.balanceCents,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function describeTimeLine(entry: TimeEntryRow): string {
  const when = entry.workedAt.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const base = `Time ${formatMinutes(entry.minutes)} · ${when}`;
  return entry.description ? `${base}: ${entry.description}` : base;
}
