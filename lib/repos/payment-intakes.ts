/**
 * Finance → Payments intakes (Phase 11 P11-05).
 * Orchestrates trust_ledger_entries and fee_payments / fee GL. Does not merge ledgers.
 *
 * Trust destination posting rule (documented):
 * 1) One trust receipt for the FULL cash amount (bank/vault + liability).
 * 2) fee_revenue lines: trust ledger disbursement with skipGl, then either
 *    apply retainer (invoice) or fee-earned-from-trust GL (no invoice).
 * 3) trust_hold and disbursement_float remain as trust liability.
 *
 * Fees-only (fee_bank / fee_vault): no trust posts. Invoice → createFeePayment using intake
 * receipt number; no invoice → direct fee cash GL (1010 bank or 1020 vault).
 */
import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb, runInTransaction } from "@/lib/db";
import {
  clients,
  feePayments,
  financePaymentAllocationLines,
  financePaymentIntakes,
  matters,
  trustLedgerEntries,
} from "@/lib/db/schema";
import type {
  FeeCategory,
  PaymentDestination,
  PaymentIntakeInput,
} from "@/lib/finance/payment-intake-validation";
import {
  feeDestinationCashGlCode,
} from "@/lib/finance/payment-intake-validation";
import { postDirectFeeCashGl } from "@/lib/gl/posting-payment-intake";
import { reverseJournalBySource } from "@/lib/gl/journals";
import { reverseTrustLedgerGl } from "@/lib/gl/posting-trust";
import { createFeePayment, getInvoice, sumFeePayments } from "@/lib/repos/billing";
import {
  reverseFeePayment,
  reverseTrustFee,
  transferTrustToFees,
} from "@/lib/repos/finance-movements";
import { allocatePaymentIntakeReceiptNumber } from "@/lib/repos/firm-settings";
import {
  getClientTrustBalance,
  getTrustAccount,
  lockClientTrust,
  postTrustLedgerEntry,
} from "@/lib/repos/trust";

export type PaymentIntakeListFilters = {
  clientId?: string;
  matterId?: string;
  destination?: string;
  from?: Date;
  to?: Date;
  minAmountCents?: number;
  maxAmountCents?: number;
  limit?: number;
};

function lineTypeLabel(lineType: string): string {
  if (lineType === "trust_hold") return "Trust hold";
  if (lineType === "disbursement_float") return "Disbursement float";
  if (lineType === "fee_revenue") return "Fee revenue";
  return lineType;
}

function asFeeCategory(value: string | null): FeeCategory {
  return value as FeeCategory;
}

async function assertClientInFirm(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
    .limit(1);
  if (!rows[0]) throw new AuthError("validation", "Client not found.");
}

async function assertMatterForClient(
  firmId: string,
  matterId: string | null,
  clientId: string,
) {
  if (!matterId) return;
  const db = getDb();
  const rows = await db
    .select({ id: matters.id, clientId: matters.clientId })
    .from(matters)
    .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
    .limit(1);
  const matter = rows[0];
  if (!matter) throw new AuthError("validation", "Matter not found.");
  if (matter.clientId !== clientId) {
    throw new AuthError("validation", "Matter does not belong to the selected client.");
  }
}

async function applyFeeRevenueFromTrust(
  firmId: string,
  userId: string,
  opts: {
    intakeId: string;
    amountCents: number;
    receivedAt: Date;
    receiptNumber: string;
    feeCategory: FeeCategory;
    invoiceId: string | null;
    clientId: string;
    matterId: string | null;
    trustAccountId: string;
  },
) {
  await transferTrustToFees(firmId, userId, {
    clientId: opts.clientId,
    matterId: opts.matterId,
    trustAccountId: opts.trustAccountId,
    amountCents: opts.amountCents,
    occurredAt: opts.receivedAt,
    reference: opts.receiptNumber,
    invoiceId: opts.invoiceId,
    feeCategory: opts.feeCategory,
    sourceType: "intake_fee",
    intakeId: opts.intakeId,
    narrative: `Fee allocation from payment ${opts.receiptNumber} (${opts.feeCategory})`,
  });
}

/** Every invoice line must be the same client's, open, and within its balance, before anything posts. */
async function assertInvoiceLines(
  firmId: string,
  clientId: string,
  lines: PaymentIntakeInput["lines"],
) {
  const perInvoice = new Map<string, number>();
  for (const line of lines) {
    if (!line.invoiceId) continue;
    perInvoice.set(line.invoiceId, (perInvoice.get(line.invoiceId) ?? 0) + line.amountCents);
  }
  for (const [invoiceId, amount] of perInvoice) {
    const full = await getInvoice(firmId, invoiceId);
    if (!full) throw new AuthError("validation", "Invoice not found for fee allocation.");
    if (full.invoice.clientId !== clientId) {
      throw new AuthError(
        "validation",
        `Invoice ${full.invoice.invoiceNumber} belongs to a different client.`,
      );
    }
    if (full.invoice.status === "draft" || full.invoice.status === "void") {
      throw new AuthError("validation", "Cannot apply fees to a draft or void invoice.");
    }
    const paid = await sumFeePayments(firmId, invoiceId);
    const balance = full.invoice.totalCents - paid - (full.invoice.retainerAppliedCents ?? 0);
    if (amount > balance) {
      throw new AuthError(
        "validation",
        `Allocation to ${full.invoice.invoiceNumber} exceeds its balance (${balance} cents remaining).`,
      );
    }
  }
}

async function applyFeeRevenueDirect(
  firmId: string,
  userId: string,
  opts: {
    intakeId: string;
    lineId: string;
    lineIndex: number;
    amountCents: number;
    currency: string;
    receivedAt: Date;
    receiptNumber: string;
    feeCategory: FeeCategory;
    invoiceId: string | null;
    clientId: string;
    matterId: string | null;
    method: string | null;
    reference: string | null;
    cashGlCode: "1010" | "1020";
  },
) {
  if (opts.invoiceId) {
    const full = await getInvoice(firmId, opts.invoiceId);
    if (!full) throw new AuthError("validation", "Invoice not found for fee allocation.");
    if (full.invoice.clientId !== opts.clientId) {
      throw new AuthError("validation", "Invoice client does not match payment client.");
    }
    await createFeePayment(firmId, userId, opts.invoiceId, {
      amountCents: opts.amountCents,
      currency: opts.currency,
      paidAt: opts.receivedAt,
      method: opts.method,
      reference: opts.reference,
      notes: `Payments intake ${opts.receiptNumber} (${opts.feeCategory})`,
      receiptNumber: opts.lineIndex === 0 ? opts.receiptNumber : `${opts.receiptNumber}/${opts.lineIndex + 1}`,
      cashGlCode: opts.cashGlCode,
      intakeId: opts.intakeId,
    });
    return;
  }

  await postDirectFeeCashGl(firmId, userId, {
    sourceId: `${opts.intakeId}-line-${opts.lineId}`,
    amountCents: opts.amountCents,
    currency: opts.currency,
    entryDate: opts.receivedAt,
    reference: opts.receiptNumber,
    feeCategory: opts.feeCategory,
    clientId: opts.clientId,
    matterId: opts.matterId,
    cashGlCode: opts.cashGlCode,
  });
}

export async function createPaymentIntake(
  firmId: string,
  userId: string,
  input: PaymentIntakeInput,
) {
  const lineTotal = input.lines.reduce((s, l) => s + l.amountCents, 0);
  if (lineTotal !== input.amountCents) {
    throw new AuthError(
      "validation",
      `Allocation lines (${lineTotal}) must equal the amount received (${input.amountCents}).`,
    );
  }
  return runInTransaction(() => createPaymentIntakeTx(firmId, userId, input));
}

async function createPaymentIntakeTx(
  firmId: string,
  userId: string,
  input: PaymentIntakeInput,
) {
  await assertClientInFirm(firmId, input.clientId);
  await assertMatterForClient(firmId, input.matterId, input.clientId);
  await lockClientTrust(firmId, input.clientId);
  await assertInvoiceLines(firmId, input.clientId, input.lines);

  let trustAccountId: string | null = null;
  if (input.destination === "trust_bank" || input.destination === "trust_vault") {
    const account = await getTrustAccount(firmId, input.trustAccountId!);
    if (!account || !account.isActive) {
      throw new AuthError("validation", "Active trust account not found.");
    }
    const expectedKind = input.destination === "trust_vault" ? "vault" : "bank";
    if (account.accountKind !== expectedKind) {
      throw new AuthError(
        "validation",
        `Trust account must be a ${expectedKind} account for destination ${input.destination}.`,
      );
    }
    trustAccountId = account.id;
  }

  const receiptNumber = await allocatePaymentIntakeReceiptNumber(firmId);
  const db = getDb();

  const [intake] = await db
    .insert(financePaymentIntakes)
    .values({
      firmId,
      clientId: input.clientId,
      matterId: input.matterId,
      receivedAt: input.receivedAt,
      amountCents: input.amountCents,
      currency: input.currency,
      destination: input.destination,
      method: input.method,
      reference: input.reference,
      receiptNumber,
      notes: input.notes,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();

  const lineRows = await db
    .insert(financePaymentAllocationLines)
    .values(
      input.lines.map((line) => ({
        firmId,
        intakeId: intake!.id,
        lineType: line.lineType,
        feeCategory: line.feeCategory,
        amountCents: line.amountCents,
        invoiceId: line.invoiceId,
        notes: line.notes,
      })),
    )
    .returning();

  if (trustAccountId) {
    const trustParts = input.lines
      .filter((l) => l.lineType === "trust_hold" || l.lineType === "disbursement_float")
      .map((l) => `${lineTypeLabel(l.lineType)} ${l.amountCents / 100}`)
      .join("; ");
    const feeParts = input.lines
      .filter((l) => l.lineType === "fee_revenue")
      .map((l) => `fee ${l.feeCategory} ${l.amountCents / 100}`)
      .join("; ");

    await postTrustLedgerEntry(firmId, userId, {
      trustAccountId,
      matterId: input.matterId,
      clientId: input.clientId,
      entryType: "receipt",
      amountCents: input.amountCents,
      currency: input.currency,
      occurredAt: input.receivedAt,
      reference: input.reference ?? receiptNumber,
      referenceNumber: receiptNumber,
      narrative: [
        `Payment intake ${receiptNumber}`,
        trustParts ? `Held: ${trustParts}` : null,
        feeParts ? `Then allocated: ${feeParts}` : null,
        input.notes,
      ]
        .filter(Boolean)
        .join(". "),
      transferToAccountId: null,
      adjustmentCredit: false,
      allowNegative: false,
      sourceType: "intake",
      sourceId: intake!.id,
      intakeId: intake!.id,
    });

    for (const line of lineRows) {
      if (line.lineType !== "fee_revenue" || !line.feeCategory) continue;
      await applyFeeRevenueFromTrust(firmId, userId, {
        intakeId: intake!.id,
        amountCents: line.amountCents,
        receivedAt: input.receivedAt,
        receiptNumber,
        feeCategory: asFeeCategory(line.feeCategory),
        invoiceId: line.invoiceId,
        clientId: input.clientId,
        matterId: input.matterId,
        trustAccountId,
      });
    }
  } else {
    const cashGlCode = feeDestinationCashGlCode(input.destination as PaymentDestination);
    let feeIndex = 0;
    for (const line of lineRows) {
      if (line.lineType !== "fee_revenue" || !line.feeCategory) continue;
      await applyFeeRevenueDirect(firmId, userId, {
        intakeId: intake!.id,
        lineId: line.id,
        lineIndex: feeIndex++,
        amountCents: line.amountCents,
        currency: input.currency,
        receivedAt: input.receivedAt,
        receiptNumber,
        feeCategory: asFeeCategory(line.feeCategory),
        invoiceId: line.invoiceId,
        clientId: input.clientId,
        matterId: input.matterId,
        method: input.method,
        reference: input.reference,
        cashGlCode,
      });
    }
  }

  return getPaymentIntake(firmId, intake!.id);
}

/**
 * Reverse a whole payment intake (bounced payment, wrong client, keying error).
 * Fee applications are unwound first, then the trust receipt; each posting keeps
 * its original row and gains a linked contra. Blocks if the trust money was spent.
 */
export async function reversePaymentIntake(
  firmId: string,
  userId: string,
  intakeId: string,
  reason: string,
) {
  if (!reason.trim()) throw new AuthError("validation", "A reason is required to reverse a payment.");
  return runInTransaction(async () => {
    const db = getDb();
    const found = await db
      .select()
      .from(financePaymentIntakes)
      .where(and(eq(financePaymentIntakes.firmId, firmId), eq(financePaymentIntakes.id, intakeId)))
      .limit(1);
    const intake = found[0];
    if (!intake) throw new AuthError("not_found", "Payment not found.");
    await lockClientTrust(firmId, intake.clientId);
    if (intake.reversedAt) throw new AuthError("validation", "This payment has already been reversed.");

    const trustRows = await db
      .select()
      .from(trustLedgerEntries)
      .where(and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.intakeId, intakeId)));

    for (const row of trustRows) {
      if (row.sourceType === "intake_fee" && !row.reversedById) {
        await reverseTrustFee(firmId, userId, row.id, reason);
      }
    }

    const receipt = trustRows.find((r) => r.sourceType === "intake" && !r.reversedById);
    if (receipt) {
      const bal = await getClientTrustBalance(firmId, intake.clientId, {
        trustAccountId: receipt.trustAccountId,
      });
      if (bal - receipt.amountCents < 0) {
        throw new AuthError(
          "validation",
          `Cannot reverse: part of this payment has already been used from trust (available ${bal}, receipt ${receipt.amountCents}). Reverse the later payments first.`,
        );
      }
      const [contra] = await db
        .insert(trustLedgerEntries)
        .values({
          firmId,
          trustAccountId: receipt.trustAccountId,
          matterId: receipt.matterId,
          clientId: receipt.clientId,
          entryType: receipt.entryType,
          amountCents: -receipt.amountCents,
          currency: receipt.currency,
          occurredAt: new Date(),
          reference: receipt.reference,
          referenceNumber: receipt.referenceNumber ? `${receipt.referenceNumber}-REV` : null,
          narrative: `Reversal of payment ${intake.receiptNumber ?? ""}: ${reason.trim()}`,
          sourceType: "reversal",
          sourceId: receipt.id,
          intakeId,
          reversalOfId: receipt.id,
          reversalReason: reason.trim(),
          createdBy: userId,
        })
        .returning();
      await db
        .update(trustLedgerEntries)
        .set({ reversedById: contra!.id, reversalReason: reason.trim() })
        .where(eq(trustLedgerEntries.id, receipt.id));
      await reverseTrustLedgerGl(firmId, userId, receipt.id, contra!.id);
    }

    const payments = await db
      .select()
      .from(feePayments)
      .where(and(eq(feePayments.firmId, firmId), eq(feePayments.intakeId, intakeId)));
    for (const p of payments) {
      if (!p.reversalOfId && !p.reversedById) {
        await reverseFeePayment(firmId, userId, p.id, reason);
      }
    }

    const lines = await db
      .select()
      .from(financePaymentAllocationLines)
      .where(
        and(
          eq(financePaymentAllocationLines.firmId, firmId),
          eq(financePaymentAllocationLines.intakeId, intakeId),
        ),
      );
    for (const line of lines) {
      await reverseJournalBySource(
        firmId,
        userId,
        "payment_intake",
        `${intakeId}-line-${line.id}`,
        `Reversal of payment ${intake.receiptNumber ?? ""}: ${reason.trim()}`,
      );
    }

    await db
      .update(financePaymentIntakes)
      .set({ reversedAt: new Date(), reversedBy: userId, reversalReason: reason.trim(), updatedAt: new Date() })
      .where(eq(financePaymentIntakes.id, intakeId));

    return getPaymentIntake(firmId, intakeId);
  });
}

export async function getPaymentIntake(firmId: string, intakeId: string) {
  const db = getDb();
  const rows = await db
    .select({
      intake: financePaymentIntakes,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(financePaymentIntakes)
    .innerJoin(
      clients,
      and(eq(clients.id, financePaymentIntakes.clientId), eq(clients.firmId, firmId)),
    )
    .leftJoin(
      matters,
      and(eq(matters.id, financePaymentIntakes.matterId), eq(matters.firmId, firmId)),
    )
    .where(
      and(
        eq(financePaymentIntakes.firmId, firmId),
        eq(financePaymentIntakes.id, intakeId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const lines = await db
    .select()
    .from(financePaymentAllocationLines)
    .where(
      and(
        eq(financePaymentAllocationLines.firmId, firmId),
        eq(financePaymentAllocationLines.intakeId, intakeId),
      ),
    )
    .orderBy(asc(financePaymentAllocationLines.createdAt));

  return {
    intake: row.intake,
    clientName: clientDisplayName({
      clientType: row.clientType,
      fullName: row.clientFullName,
      legalName: row.clientLegalName,
      tradingName: row.clientTradingName,
    }),
    clientNumber: row.clientNumber,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    lines,
  };
}

export async function listPaymentIntakes(
  firmId: string,
  filters: PaymentIntakeListFilters = {},
) {
  const db = getDb();
  const conditions = [eq(financePaymentIntakes.firmId, firmId)];
  if (filters.clientId) {
    conditions.push(eq(financePaymentIntakes.clientId, filters.clientId));
  }
  if (filters.matterId) {
    conditions.push(eq(financePaymentIntakes.matterId, filters.matterId));
  }
  if (filters.destination) {
    conditions.push(eq(financePaymentIntakes.destination, filters.destination));
  }
  if (filters.from) {
    conditions.push(gte(financePaymentIntakes.receivedAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(financePaymentIntakes.receivedAt, filters.to));
  }
  if (filters.minAmountCents != null) {
    conditions.push(gte(financePaymentIntakes.amountCents, filters.minAmountCents));
  }
  if (filters.maxAmountCents != null) {
    conditions.push(lte(financePaymentIntakes.amountCents, filters.maxAmountCents));
  }

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

  const rows = await db
    .select({
      intake: financePaymentIntakes,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      lineCount: sql<number>`(
        select count(*)::int from ${financePaymentAllocationLines}
        where ${financePaymentAllocationLines.intakeId} = ${financePaymentIntakes.id}
      )`,
    })
    .from(financePaymentIntakes)
    .innerJoin(
      clients,
      and(eq(clients.id, financePaymentIntakes.clientId), eq(clients.firmId, firmId)),
    )
    .leftJoin(
      matters,
      and(eq(matters.id, financePaymentIntakes.matterId), eq(matters.firmId, firmId)),
    )
    .where(and(...conditions))
    .orderBy(desc(financePaymentIntakes.receivedAt), desc(financePaymentIntakes.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    intake: row.intake,
    clientName: clientDisplayName({
      clientType: row.clientType,
      fullName: row.clientFullName,
      legalName: row.clientLegalName,
      tradingName: row.clientTradingName,
    }),
    clientNumber: row.clientNumber,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    lineCount: Number(row.lineCount) || 0,
  }));
}
