import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { creditorInvoices, creditorPayments, creditors } from "@/lib/db/schema";
import {
  buildCreditorAging,
  postCreditorInvoiceGl,
  postCreditorPaymentGl,
  sumCreditorPayments,
} from "@/lib/gl/posting-creditors";

export async function listCreditors(firmId: string, activeOnly = true) {
  const db = getDb();
  const conditions = [eq(creditors.firmId, firmId)];
  if (activeOnly) conditions.push(eq(creditors.isActive, true));
  return db
    .select()
    .from(creditors)
    .where(and(...conditions))
    .orderBy(creditors.name);
}

export async function createCreditor(
  firmId: string,
  input: {
    name: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    defaultExpenseAccountId?: string | null;
  },
) {
  const db = getDb();
  const rows = await db
    .insert(creditors)
    .values({
      firmId,
      name: input.name.trim(),
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      defaultExpenseAccountId: input.defaultExpenseAccountId ?? null,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function listCreditorInvoices(firmId: string, opts?: { creditorId?: string; status?: string }) {
  const db = getDb();
  const conditions = [eq(creditorInvoices.firmId, firmId)];
  if (opts?.creditorId) conditions.push(eq(creditorInvoices.creditorId, opts.creditorId));
  if (opts?.status) conditions.push(eq(creditorInvoices.status, opts.status));

  return db
    .select({
      invoice: creditorInvoices,
      creditorName: creditors.name,
    })
    .from(creditorInvoices)
    .innerJoin(creditors, eq(creditors.id, creditorInvoices.creditorId))
    .where(and(...conditions))
    .orderBy(desc(creditorInvoices.invoiceDate));
}

export async function createCreditorInvoice(
  firmId: string,
  userId: string,
  input: {
    creditorId: string;
    invoiceDate: Date;
    dueDate?: Date | null;
    amountCents: number;
    currency: string;
    reference?: string | null;
    expenseAccountId?: string | null;
    notes?: string | null;
  },
) {
  const db = getDb();
  const [invoice] = await db
    .insert(creditorInvoices)
    .values({
      firmId,
      creditorId: input.creditorId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate ?? null,
      amountCents: input.amountCents,
      currency: input.currency,
      reference: input.reference ?? null,
      status: "open",
      expenseAccountId: input.expenseAccountId ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();

  await postCreditorInvoiceGl(firmId, userId, invoice!.id);
  return invoice!;
}

export async function payCreditorInvoice(
  firmId: string,
  userId: string,
  invoiceId: string,
  input: {
    amountCents: number;
    currency: string;
    paidAt: Date;
    paymentMethod?: string | null;
    reference?: string | null;
  },
) {
  const db = getDb();
  const invRows = await db
    .select()
    .from(creditorInvoices)
    .where(and(eq(creditorInvoices.firmId, firmId), eq(creditorInvoices.id, invoiceId)))
    .limit(1);
  const invoice = invRows[0];
  if (!invoice) throw new AuthError("not_found", "Bill not found.");
  if (invoice.status === "void") throw new AuthError("validation", "Cannot pay a void bill.");

  const paid = await sumCreditorPayments(firmId, invoiceId);
  if (paid + input.amountCents > invoice.amountCents) {
    throw new AuthError("validation", "Payment exceeds bill balance.");
  }

  const [payment] = await db
    .insert(creditorPayments)
    .values({
      firmId,
      creditorInvoiceId: invoiceId,
      amountCents: input.amountCents,
      currency: input.currency,
      paidAt: input.paidAt,
      paymentMethod: input.paymentMethod ?? null,
      reference: input.reference ?? null,
      createdBy: userId,
    })
    .returning();

  await postCreditorPaymentGl(firmId, userId, payment!.id);

  const newPaid = await sumCreditorPayments(firmId, invoiceId);
  if (newPaid >= invoice.amountCents) {
    await db
      .update(creditorInvoices)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(creditorInvoices.firmId, firmId), eq(creditorInvoices.id, invoiceId)));
  }

  return payment!;
}

export { buildCreditorAging };
