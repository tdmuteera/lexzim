/**
 * Money movements that span ledgers: trust to fees, reversals and invoice settlement.
 *
 * Fee from trust (invoice or no invoice), one atomic unit:
 *   trust ledger: disbursement on the client (source invoice_fee / intake_fee)
 *   GL: Dr 2100 trust liability, Cr 1310 AR (invoice) or fee revenue (no invoice)
 *       Dr 1010 operating bank (1020 business vault for vault trust), Cr 1210 trust bank
 * so the trust bank in GL always equals the sum of the trust ledger.
 */
import "server-only";

import { and, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb, lockFinanceKey, runInTransaction } from "@/lib/db";
import { feePayments, invoices, trustLedgerEntries } from "@/lib/db/schema";
import { feeCategoryGlCode, type FeeCategory } from "@/lib/finance/payment-intake-validation";
import { ensureGlAccountByCode } from "@/lib/gl/accounts";
import { postManualJournal, reverseJournalBySource } from "@/lib/gl/journals";
import { getInvoice, sumFeePayments } from "@/lib/repos/billing";
import {
  getClientTrustBalance,
  getTrustAccount,
  listTrustAccounts,
  lockClientTrust,
  postTrustLedgerEntry,
} from "@/lib/repos/trust";

export async function lockInvoice(firmId: string, invoiceId: string) {
  await lockFinanceKey(`invoice:${firmId}:${invoiceId}`);
}

/** Outstanding = total - net fee payments - amounts settled from trust. */
export async function invoiceOutstandingCents(firmId: string, invoiceId: string) {
  const full = await getInvoice(firmId, invoiceId);
  if (!full) throw new AuthError("not_found", "Invoice not found.");
  const paid = await sumFeePayments(firmId, invoiceId);
  return {
    invoice: full.invoice,
    paidCents: paid,
    trustAppliedCents: full.invoice.retainerAppliedCents ?? 0,
    outstandingCents: full.invoice.totalCents - paid - (full.invoice.retainerAppliedCents ?? 0),
  };
}

/** Set paid when fully settled; drop back to sent when a reversal reopens a balance. */
export async function recomputeInvoiceStatus(firmId: string, invoiceId: string) {
  const { invoice, outstandingCents } = await invoiceOutstandingCents(firmId, invoiceId);
  if (invoice.status === "void" || invoice.status === "draft") return invoice.status;
  let next = invoice.status;
  if (outstandingCents <= 0 && invoice.status !== "paid") next = "paid";
  if (outstandingCents > 0 && invoice.status === "paid") next = "sent";
  if (next !== invoice.status) {
    await getDb()
      .update(invoices)
      .set({ status: next, updatedAt: new Date() })
      .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)));
  }
  return next;
}

async function resolveTrustAccountForClient(
  firmId: string,
  clientId: string,
  amountCents: number,
  requested: string | null | undefined,
) {
  if (requested) {
    const acct = await getTrustAccount(firmId, requested);
    if (!acct || !acct.isActive) throw new AuthError("validation", "Active trust account not found.");
    return acct;
  }
  const accounts = await listTrustAccounts(firmId, true);
  const ordered = [
    ...accounts.filter((a) => a.accountKind === "bank"),
    ...accounts.filter((a) => a.accountKind !== "bank"),
  ];
  for (const acct of ordered) {
    const bal = await getClientTrustBalance(firmId, clientId, { trustAccountId: acct.id });
    if (bal >= amountCents) return acct;
  }
  throw new AuthError(
    "validation",
    "Insufficient client trust funds on any single trust account for this amount.",
  );
}

export type FeeFromTrustInput = {
  clientId: string;
  matterId: string | null;
  trustAccountId?: string | null;
  amountCents: number;
  occurredAt: Date;
  reference: string;
  invoiceId: string | null;
  feeCategory: FeeCategory | null;
  sourceType: "invoice_fee" | "intake_fee";
  intakeId?: string | null;
  narrative?: string | null;
  idempotencyKey?: string | null;
};

/** Move earned fees out of a client's trust funds into the business (see module header). */
export async function transferTrustToFees(
  firmId: string,
  userId: string,
  input: FeeFromTrustInput,
) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1) {
    throw new AuthError("validation", "Amount must be a positive whole number of cents.");
  }
  return runInTransaction(async () => {
    await lockClientTrust(firmId, input.clientId);
    let matterId = input.matterId;
    if (input.invoiceId) {
      await lockInvoice(firmId, input.invoiceId);
      const { invoice, outstandingCents } = await invoiceOutstandingCents(firmId, input.invoiceId);
      if (invoice.clientId !== input.clientId) {
        throw new AuthError(
          "validation",
          "Invoice belongs to a different client. Trust money can only settle the same client's invoices.",
        );
      }
      if (invoice.status === "draft" || invoice.status === "void") {
        throw new AuthError("validation", "Trust money can only settle sent or overdue invoices.");
      }
      if (input.amountCents > outstandingCents) {
        throw new AuthError(
          "validation",
          `Amount exceeds the invoice balance (${outstandingCents} cents outstanding).`,
        );
      }
      matterId = matterId ?? invoice.matterId;
    } else if (!input.feeCategory) {
      throw new AuthError("validation", "A fee category is required when no invoice is selected.");
    }

    const account = await resolveTrustAccountForClient(
      firmId,
      input.clientId,
      input.amountCents,
      input.trustAccountId,
    );

    const posted = await postTrustLedgerEntry(firmId, userId, {
      trustAccountId: account.id,
      matterId,
      clientId: input.clientId,
      entryType: "disbursement",
      amountCents: input.amountCents,
      currency: account.currency,
      occurredAt: input.occurredAt,
      reference: input.reference,
      referenceNumber: input.reference,
      narrative:
        input.narrative ??
        (input.invoiceId ? `Fees settled from trust (${input.reference})` : `Fees earned from trust (${input.reference})`),
      transferToAccountId: null,
      adjustmentCredit: false,
      allowNegative: false,
      skipGl: true,
      sourceType: input.sourceType,
      sourceId: input.invoiceId ?? input.intakeId ?? null,
      invoiceId: input.invoiceId,
      intakeId: input.intakeId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    const entry = posted.entries[0]!;
    if (posted.replayed) return { entry, replayed: true as const };

    const trustLiability = await ensureGlAccountByCode(firmId, "2100");
    const trustBank = await ensureGlAccountByCode(firmId, "1210");
    const business = await ensureGlAccountByCode(
      firmId,
      account.accountKind === "vault" ? "1020" : "1010",
    );
    const creditAccount = input.invoiceId
      ? await ensureGlAccountByCode(firmId, "1310")
      : await ensureGlAccountByCode(firmId, feeCategoryGlCode(input.feeCategory!));
    const common = { clientId: input.clientId, matterId, currency: account.currency };

    await postManualJournal(
      firmId,
      userId,
      {
        entryDate: input.occurredAt,
        reference: input.reference,
        memo: input.invoiceId ? `Invoice settled from trust ${input.reference}` : `Fees earned from trust ${input.reference}`,
        lines: [
          { accountId: trustLiability.id, debitCents: input.amountCents, creditCents: 0, lineMemo: "Trust liability released", ...common },
          { accountId: creditAccount.id, debitCents: 0, creditCents: input.amountCents, ...common },
          { accountId: business.id, debitCents: input.amountCents, creditCents: 0, lineMemo: "Earned fees moved from trust", ...common },
          { accountId: trustBank.id, debitCents: 0, creditCents: input.amountCents, ...common },
        ],
      },
      "trust_fee",
      entry.id,
    );

    if (input.invoiceId) {
      const inv = await getInvoice(firmId, input.invoiceId);
      await getDb()
        .update(invoices)
        .set({
          retainerAppliedCents: (inv!.invoice.retainerAppliedCents ?? 0) + input.amountCents,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.firmId, firmId), eq(invoices.id, input.invoiceId)));
      await recomputeInvoiceStatus(firmId, input.invoiceId);
    }
    return { entry, replayed: false as const };
  });
}

/**
 * Reverse a fee receipt (bounced cheque, wrong invoice, keying error) with a negative
 * contra payment. The original receipt stays on record, linked both ways.
 */
export async function reverseFeePayment(
  firmId: string,
  userId: string,
  paymentId: string,
  reason: string,
  expectedInvoiceId?: string,
) {
  if (!reason.trim()) throw new AuthError("validation", "A reason is required to reverse a receipt.");
  return runInTransaction(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(feePayments)
      .where(and(eq(feePayments.firmId, firmId), eq(feePayments.id, paymentId)))
      .limit(1);
    const original = rows[0];
    if (!original) throw new AuthError("not_found", "Receipt not found.");
    if (expectedInvoiceId && original.invoiceId !== expectedInvoiceId) {
      throw new AuthError("validation", "Receipt does not belong to this invoice.");
    }
    await lockInvoice(firmId, original.invoiceId);
    if (original.reversalOfId) {
      throw new AuthError("validation", "This row is itself a reversal and cannot be reversed.");
    }
    const fresh = await db
      .select({ reversedById: feePayments.reversedById })
      .from(feePayments)
      .where(eq(feePayments.id, paymentId))
      .limit(1);
    if (fresh[0]?.reversedById) throw new AuthError("validation", "This receipt has already been reversed.");

    const [contra] = await db
      .insert(feePayments)
      .values({
        firmId,
        invoiceId: original.invoiceId,
        receiptNumber: original.receiptNumber ? `${original.receiptNumber}-REV` : null,
        amountCents: -original.amountCents,
        currency: original.currency,
        paidAt: new Date(),
        method: original.method,
        reference: original.reference,
        notes: `Reversal: ${reason.trim()}`,
        clientId: original.clientId,
        matterId: original.matterId,
        intakeId: original.intakeId,
        reversalOfId: original.id,
        reversalReason: reason.trim(),
        createdBy: userId,
      })
      .returning();
    await db
      .update(feePayments)
      .set({ reversedById: contra!.id, reversalReason: reason.trim() })
      .where(eq(feePayments.id, original.id));

    await reverseJournalBySource(firmId, userId, "payment", original.id, `Receipt reversal: ${reason.trim()}`);
    const status = await recomputeInvoiceStatus(firmId, original.invoiceId);
    return { original, reversal: contra!, invoiceStatus: status };
  });
}

/** Undo a fee taken from trust: contra trust row, GL reversal, invoice balance reopened. */
export async function reverseTrustFee(
  firmId: string,
  userId: string,
  entryId: string,
  reason: string,
) {
  if (!reason.trim()) throw new AuthError("validation", "A reason is required.");
  return runInTransaction(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(trustLedgerEntries)
      .where(and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.id, entryId)))
      .limit(1);
    const original = rows[0];
    if (!original) throw new AuthError("not_found", "Trust entry not found.");
    if (original.sourceType !== "invoice_fee" && original.sourceType !== "intake_fee") {
      throw new AuthError("validation", "This entry is not a fee taken from trust.");
    }
    if (original.reversedById) throw new AuthError("validation", "Already reversed.");
    if (original.clientId) await lockClientTrust(firmId, original.clientId);
    if (original.invoiceId) await lockInvoice(firmId, original.invoiceId);

    const amount = -original.amountCents;
    const [contra] = await db
      .insert(trustLedgerEntries)
      .values({
        firmId,
        trustAccountId: original.trustAccountId,
        matterId: original.matterId,
        clientId: original.clientId,
        entryType: original.entryType,
        amountCents: amount,
        currency: original.currency,
        occurredAt: new Date(),
        reference: original.reference,
        referenceNumber: original.referenceNumber ? `${original.referenceNumber}-REV` : null,
        narrative: `Reversal of fee from trust: ${reason.trim()}`,
        sourceType: "reversal",
        sourceId: original.id,
        invoiceId: original.invoiceId,
        intakeId: original.intakeId,
        reversalOfId: original.id,
        reversalReason: reason.trim(),
        createdBy: userId,
      })
      .returning();
    await db
      .update(trustLedgerEntries)
      .set({ reversedById: contra!.id, reversalReason: reason.trim() })
      .where(eq(trustLedgerEntries.id, original.id));

    await reverseJournalBySource(
      firmId,
      userId,
      "trust_fee",
      original.id,
      `Reversal of fee from trust: ${reason.trim()}`,
    );

    if (original.invoiceId) {
      const inv = await getInvoice(firmId, original.invoiceId);
      if (inv) {
        await db
          .update(invoices)
          .set({
            retainerAppliedCents: Math.max(0, (inv.invoice.retainerAppliedCents ?? 0) - amount),
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.firmId, firmId), eq(invoices.id, original.invoiceId)));
        await recomputeInvoiceStatus(firmId, original.invoiceId);
      }
    }
    return { original, reversal: contra! };
  });
}
