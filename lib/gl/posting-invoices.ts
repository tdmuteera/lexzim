import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  feePayments,
  firmServices,
  glJournalEntries,
  glJournalLines,
  invoices,
} from "@/lib/db/schema";
import { ensureGlAccountByCode } from "@/lib/gl/accounts";
import { getJournalEntry, postManualJournal } from "@/lib/gl/journals";
import type { ManualJournalLineInput } from "@/lib/gl/types";
import {
  quotationDiscountCents,
  quotationSubtotalCents,
} from "@/lib/quotes/totals";
import { listInvoiceLines } from "@/lib/repos/billing";

const REV_ADV_CODE = "REV-ADV";

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

function revenueAccountForLine(
  line: {
    lineType: string;
    amountCents: number;
    revenueGlAccountId: string | null;
    serviceCode: string | null;
  },
  defaults: {
    revenueDefault: string;
    reimbursed: string;
    trustLiability: string;
  },
): string | null {
  if (line.amountCents <= 0) return null;

  if (line.serviceCode === REV_ADV_CODE) {
    return defaults.trustLiability;
  }
  if (line.lineType === "disbursement") {
    return defaults.reimbursed;
  }
  if (line.revenueGlAccountId) {
    return line.revenueGlAccountId;
  }
  return defaults.revenueDefault;
}

/** Post GL when invoice is marked sent (idempotent). */
export async function postInvoiceSentGl(
  firmId: string,
  userId: string,
  invoiceId: string,
) {
  const existing = await findPostedJournal(firmId, "invoice", invoiceId);
  if (existing) return existing;

  const db = getDb();
  const invRows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .limit(1);
  const invoice = invRows[0];
  if (!invoice) throw new AuthError("not_found", "Invoice not found.");

  const rawLines = await listInvoiceLines(firmId, invoiceId);
  const serviceIds = rawLines.map((l) => l.firmServiceId).filter(Boolean) as string[];
  const serviceCodeById = new Map<string, string>();
  if (serviceIds.length) {
    const services = await db
      .select({ id: firmServices.id, code: firmServices.code })
      .from(firmServices)
      .where(and(eq(firmServices.firmId, firmId)));
    for (const s of services) serviceCodeById.set(s.id, s.code);
  }

  const ar = await ensureGlAccountByCode(firmId, "1310");
  const salesDiscount = await ensureGlAccountByCode(firmId, "4050");
  const revenueDefault = await ensureGlAccountByCode(firmId, "4030");
  const reimbursed = await ensureGlAccountByCode(firmId, "4100");
  const trustLiability = await ensureGlAccountByCode(firmId, "2100");

  const grossCents = quotationSubtotalCents(
    rawLines.filter((l) => l.amountCents > 0).map((l) => ({ lineTotalCents: l.amountCents })),
  );
  const discountApplied = quotationDiscountCents(
    grossCents,
    invoice.discountCents,
    invoice.discountPct,
  );
  const netArCents = Math.max(0, grossCents - discountApplied);

  const creditByAccount = new Map<string, number>();
  for (const line of rawLines) {
    if (line.amountCents <= 0) continue;
    const serviceCode = line.firmServiceId
      ? (serviceCodeById.get(line.firmServiceId) ?? null)
      : null;
    const accountId = revenueAccountForLine(
      {
        lineType: line.lineType,
        amountCents: line.amountCents,
        revenueGlAccountId: line.revenueGlAccountId,
        serviceCode,
      },
      {
        revenueDefault: revenueDefault.id,
        reimbursed: reimbursed.id,
        trustLiability: trustLiability.id,
      },
    );
    if (!accountId) continue;
    creditByAccount.set(accountId, (creditByAccount.get(accountId) ?? 0) + line.amountCents);
  }

  const journalLines: ManualJournalLineInput[] = [];
  if (netArCents > 0) {
    journalLines.push({
      accountId: ar.id,
      debitCents: netArCents,
      creditCents: 0,
      matterId: invoice.matterId,
      clientId: invoice.clientId,
      currency: invoice.currency,
      lineMemo: `Invoice ${invoice.invoiceNumber}`,
    });
  }
  if (discountApplied > 0) {
    journalLines.push({
      accountId: salesDiscount.id,
      debitCents: discountApplied,
      creditCents: 0,
      matterId: invoice.matterId,
      clientId: invoice.clientId,
      currency: invoice.currency,
      lineMemo: "Invoice discount",
    });
  }
  for (const [accountId, creditCents] of creditByAccount) {
    journalLines.push({
      accountId,
      debitCents: 0,
      creditCents,
      matterId: invoice.matterId,
      clientId: invoice.clientId,
      currency: invoice.currency,
    });
  }

  if (journalLines.length < 2) {
    throw new AuthError("validation", "Invoice has nothing to post to the ledger.");
  }

  const entryDate = invoice.issueDate ?? new Date();
  return postManualJournal(
    firmId,
    userId,
    {
      entryDate,
      reference: invoice.invoiceNumber,
      memo: `Invoice sent ${invoice.invoiceNumber}`,
      lines: journalLines,
    },
    "invoice",
    invoiceId,
  );
}

/** Post GL when a fee payment is recorded (idempotent). */
export async function postFeePaymentGl(
  firmId: string,
  userId: string,
  paymentId: string,
  opts?: { cashGlCode?: "1010" | "1020" },
) {
  const existing = await findPostedJournal(firmId, "payment", paymentId);
  if (existing) return existing;

  const db = getDb();
  const payRows = await db
    .select({
      payment: feePayments,
      invoice: invoices,
    })
    .from(feePayments)
    .innerJoin(invoices, eq(invoices.id, feePayments.invoiceId))
    .where(and(eq(feePayments.firmId, firmId), eq(feePayments.id, paymentId)))
    .limit(1);

  const row = payRows[0];
  if (!row) throw new AuthError("not_found", "Payment not found.");

  const cash = await ensureGlAccountByCode(firmId, opts?.cashGlCode ?? "1010");
  const ar = await ensureGlAccountByCode(firmId, "1310");

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: row.payment.paidAt,
      reference: row.payment.receiptNumber ?? row.invoice.invoiceNumber,
      memo: `Fee receipt ${row.payment.receiptNumber ?? paymentId.slice(0, 8)}`,
      lines: [
        {
          accountId: cash.id,
          debitCents: row.payment.amountCents,
          creditCents: 0,
          matterId: row.invoice.matterId,
          clientId: row.invoice.clientId,
          currency: row.payment.currency,
          lineMemo: row.payment.method ?? undefined,
        },
        {
          accountId: ar.id,
          debitCents: 0,
          creditCents: row.payment.amountCents,
          matterId: row.invoice.matterId,
          clientId: row.invoice.clientId,
          currency: row.payment.currency,
        },
      ],
    },
    "payment",
    paymentId,
  );
}

/** Reverse invoice GL on void when a sent invoice had been posted. */
export async function reverseInvoiceSentGl(
  firmId: string,
  userId: string,
  invoiceId: string,
) {
  const original = await findPostedJournal(firmId, "invoice", invoiceId);
  if (!original) return null;

  const full = await getJournalEntry(firmId, original.id);
  if (!full) return null;

  const reverseLines: ManualJournalLineInput[] = full.lines.map(({ line }) => ({
    accountId: line.accountId,
    debitCents: line.creditCents,
    creditCents: line.debitCents,
    matterId: line.matterId,
    clientId: line.clientId,
    currency: line.currency,
    lineMemo: line.lineMemo ? `Reversal: ${line.lineMemo}` : "Invoice void reversal",
  }));

  const reversal = await postManualJournal(
    firmId,
    userId,
    {
      entryDate: new Date(),
      reference: original.reference ? `VOID ${original.reference}` : "VOID",
      memo: "Void invoice reversal",
      lines: reverseLines,
    },
    "invoice",
    `${invoiceId}-void`,
  );

  const db = getDb();
  await db
    .update(glJournalEntries)
    .set({ reversedByEntryId: reversal.id })
    .where(and(eq(glJournalEntries.firmId, firmId), eq(glJournalEntries.id, original.id)));

  return reversal;
}

/** Apply client retainer (trust liability) against invoice AR. */
export async function postApplyRetainerGl(
  firmId: string,
  userId: string,
  invoiceId: string,
  amountCents: number,
) {
  if (amountCents < 1) {
    throw new AuthError("validation", "Retainer amount must be positive.");
  }

  const sourceId = `${invoiceId}-retainer-${amountCents}`;
  const existing = await findPostedJournal(firmId, "trust", sourceId);
  if (existing) return existing;

  const db = getDb();
  const invRows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .limit(1);
  const invoice = invRows[0];
  if (!invoice) throw new AuthError("not_found", "Invoice not found.");

  const trustLiability = await ensureGlAccountByCode(firmId, "2100");
  const ar = await ensureGlAccountByCode(firmId, "1310");

  const entry = await postManualJournal(
    firmId,
    userId,
    {
      entryDate: new Date(),
      reference: invoice.invoiceNumber,
      memo: `Apply retainer to ${invoice.invoiceNumber}`,
      lines: [
        {
          accountId: trustLiability.id,
          debitCents: amountCents,
          creditCents: 0,
          matterId: invoice.matterId,
          clientId: invoice.clientId,
          currency: invoice.currency,
          lineMemo: "Retainer applied",
        },
        {
          accountId: ar.id,
          debitCents: 0,
          creditCents: amountCents,
          matterId: invoice.matterId,
          clientId: invoice.clientId,
          currency: invoice.currency,
        },
      ],
    },
    "trust",
    sourceId,
  );

  await db
    .update(invoices)
    .set({
      retainerAppliedCents: invoice.retainerAppliedCents + amountCents,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)));

  return entry;
}
