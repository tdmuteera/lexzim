/**
 * Billing repository stubs (P3-01).
 * EVERY firm-scoped query MUST filter firmId.
 * Fee payments are separate from trust ledger.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  disbursements,
  feePayments,
  invoiceLines,
  invoices,
  timeEntries,
} from "@/lib/db/schema";

export async function listTimeEntries(firmId: string, matterId?: string) {
  const db = getDb();
  const conditions = [eq(timeEntries.firmId, firmId)];
  if (matterId) conditions.push(eq(timeEntries.matterId, matterId));
  return db
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(desc(timeEntries.workedAt));
}

export async function listDisbursements(firmId: string, matterId?: string) {
  const db = getDb();
  const conditions = [eq(disbursements.firmId, firmId)];
  if (matterId) conditions.push(eq(disbursements.matterId, matterId));
  return db
    .select()
    .from(disbursements)
    .where(and(...conditions))
    .orderBy(desc(disbursements.incurredAt));
}

export async function listInvoices(firmId: string, matterId?: string) {
  const db = getDb();
  const conditions = [eq(invoices.firmId, firmId)];
  if (matterId) conditions.push(eq(invoices.matterId, matterId));
  return db
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt));
}

export async function getInvoice(firmId: string, invoiceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listInvoiceLines(firmId: string, invoiceId: string) {
  const db = getDb();
  return db
    .select()
    .from(invoiceLines)
    .where(and(eq(invoiceLines.firmId, firmId), eq(invoiceLines.invoiceId, invoiceId)));
}

export async function listFeePayments(firmId: string, invoiceId?: string) {
  const db = getDb();
  const conditions = [eq(feePayments.firmId, firmId)];
  if (invoiceId) conditions.push(eq(feePayments.invoiceId, invoiceId));
  return db
    .select()
    .from(feePayments)
    .where(and(...conditions))
    .orderBy(desc(feePayments.paidAt));
}
