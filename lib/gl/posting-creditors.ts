import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  creditorInvoices,
  creditorPayments,
  creditors,
  glJournalEntries,
} from "@/lib/db/schema";
import { ensureGlAccountByCode, getGlAccount } from "@/lib/gl/accounts";
import { postManualJournal } from "@/lib/gl/journals";

async function findPostedJournal(
  firmId: string,
  sourceType: string,
  sourceId: string,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(glJournalEntries)
    .where(
      and(
        eq(glJournalEntries.firmId, firmId),
        eq(glJournalEntries.sourceType, sourceType),
        eq(glJournalEntries.sourceId, sourceId),
        isNull(glJournalEntries.reversedByEntryId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function postCreditorInvoiceGl(
  firmId: string,
  userId: string,
  invoiceId: string,
) {
  const existing = await findPostedJournal(firmId, "expense", `ap-bill-${invoiceId}`);
  if (existing) return existing;

  const db = getDb();
  const rows = await db
    .select({
      invoice: creditorInvoices,
      creditorName: creditors.name,
      defaultExpenseAccountId: creditors.defaultExpenseAccountId,
    })
    .from(creditorInvoices)
    .innerJoin(creditors, eq(creditors.id, creditorInvoices.creditorId))
    .where(and(eq(creditorInvoices.firmId, firmId), eq(creditorInvoices.id, invoiceId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AuthError("not_found", "Creditor bill not found.");
  if (row.invoice.status === "void") return null;

  const expenseAccountId =
    row.invoice.expenseAccountId ?? row.defaultExpenseAccountId;
  if (!expenseAccountId) {
    throw new AuthError("validation", "Expense account is required on the bill.");
  }
  const expenseAccount = await getGlAccount(firmId, expenseAccountId);
  if (!expenseAccount) throw new AuthError("validation", "Expense GL account not found.");

  const ap = await ensureGlAccountByCode(firmId, "2010");
  const ref = row.invoice.reference ?? row.creditorName;

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: row.invoice.invoiceDate,
      reference: ref,
      memo: `Creditor bill: ${row.creditorName}`,
      lines: [
        {
          accountId: expenseAccount.id,
          debitCents: row.invoice.amountCents,
          creditCents: 0,
          currency: row.invoice.currency,
          lineMemo: row.invoice.notes ?? undefined,
        },
        {
          accountId: ap.id,
          debitCents: 0,
          creditCents: row.invoice.amountCents,
          currency: row.invoice.currency,
        },
      ],
    },
    "expense",
    `ap-bill-${invoiceId}`,
  );
}

export async function postCreditorPaymentGl(
  firmId: string,
  userId: string,
  paymentId: string,
) {
  const existing = await findPostedJournal(firmId, "payment", `ap-pay-${paymentId}`);
  if (existing) return existing;

  const db = getDb();
  const rows = await db
    .select({
      payment: creditorPayments,
      invoice: creditorInvoices,
      creditorName: creditors.name,
    })
    .from(creditorPayments)
    .innerJoin(creditorInvoices, eq(creditorInvoices.id, creditorPayments.creditorInvoiceId))
    .innerJoin(creditors, eq(creditors.id, creditorInvoices.creditorId))
    .where(and(eq(creditorPayments.firmId, firmId), eq(creditorPayments.id, paymentId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AuthError("not_found", "Creditor payment not found.");

  const ap = await ensureGlAccountByCode(firmId, "2010");
  const cash = await ensureGlAccountByCode(firmId, "1010");

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: row.payment.paidAt,
      reference: row.payment.reference ?? row.invoice.reference ?? undefined,
      memo: `Pay ${row.creditorName}`,
      lines: [
        {
          accountId: ap.id,
          debitCents: row.payment.amountCents,
          creditCents: 0,
          currency: row.payment.currency,
        },
        {
          accountId: cash.id,
          debitCents: 0,
          creditCents: row.payment.amountCents,
          currency: row.payment.currency,
        },
      ],
    },
    "payment",
    `ap-pay-${paymentId}`,
  );
}

export async function sumCreditorPayments(firmId: string, invoiceId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${creditorPayments.amountCents}), 0)::int` })
    .from(creditorPayments)
    .where(
      and(eq(creditorPayments.firmId, firmId), eq(creditorPayments.creditorInvoiceId, invoiceId)),
    );
  return rows[0]?.total ?? 0;
}

export type CreditorAgingRow = {
  creditorId: string;
  creditorName: string;
  invoiceId: string;
  reference: string | null;
  dueDate: string | null;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  bucket: string;
};

export async function buildCreditorAging(firmId: string): Promise<CreditorAgingRow[]> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      invoice: creditorInvoices,
      creditorName: creditors.name,
    })
    .from(creditorInvoices)
    .innerJoin(creditors, eq(creditors.id, creditorInvoices.creditorId))
    .where(and(eq(creditorInvoices.firmId, firmId), eq(creditorInvoices.status, "open")));

  const results: CreditorAgingRow[] = [];
  for (const row of rows) {
    const paid = await sumCreditorPayments(firmId, row.invoice.id);
    const balance = row.invoice.amountCents - paid;
    if (balance <= 0) continue;
    const due = row.invoice.dueDate ?? row.invoice.invoiceDate;
    const days = Math.floor((now.getTime() - due.getTime()) / (86400 * 1000));
    let bucket = "current";
    if (days > 90) bucket = "90+";
    else if (days > 60) bucket = "61-90";
    else if (days > 30) bucket = "31-60";
    else if (days > 0) bucket = "1-30";

    results.push({
      creditorId: row.invoice.creditorId,
      creditorName: row.creditorName,
      invoiceId: row.invoice.id,
      reference: row.invoice.reference,
      dueDate: row.invoice.dueDate?.toISOString() ?? null,
      amountCents: row.invoice.amountCents,
      paidCents: paid,
      balanceCents: balance,
      bucket,
    });
  }
  return results.sort((a, b) => a.creditorName.localeCompare(b.creditorName));
}
