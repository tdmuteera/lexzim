import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb, lockFinanceKey, runInTransaction } from "@/lib/db";
import { glAccounts, glJournalEntries, glJournalLines } from "@/lib/db/schema";
import { ensureGlAccountByCode } from "@/lib/gl/accounts";
import { postManualJournal, reverseJournalBySource } from "@/lib/gl/journals";

/** Disbursement float (GL 1060): firm money set aside for client disbursements. */
export const FLOAT_GL_CODE = "1060";
export type FloatCashCode = "1010" | "1020";

function assertCashCode(code: unknown): FloatCashCode {
  if (code === "1010" || code === "1020") return code;
  throw new AuthError("validation", "Account must be the operating bank (1010) or the business cashbook/vault (1020).");
}

function assertAmount(amountCents: unknown): number {
  const n = Number(amountCents);
  if (!Number.isInteger(n) || n < 1) {
    throw new AuthError("validation", "amountCents must be a positive integer.");
  }
  return n;
}

export async function lockFloat(firmId: string) {
  await lockFinanceKey(`float:${firmId}`);
}

export async function getFloatBalanceCents(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      dr: sql<string>`coalesce(sum(${glJournalLines.debitCents}), 0)`,
      cr: sql<string>`coalesce(sum(${glJournalLines.creditCents}), 0)`,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .where(and(eq(glJournalLines.firmId, firmId), eq(glAccounts.code, FLOAT_GL_CODE)));
  return Number(rows[0]?.dr ?? 0) - Number(rows[0]?.cr ?? 0);
}

export async function listFloatJournals(firmId: string, limit = 50) {
  const db = getDb();
  return db
    .select({
      id: glJournalEntries.id,
      entryDate: glJournalEntries.entryDate,
      memo: glJournalEntries.memo,
      sourceType: glJournalEntries.sourceType,
      sourceId: glJournalEntries.sourceId,
      debitCents: glJournalLines.debitCents,
      creditCents: glJournalLines.creditCents,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .innerJoin(glJournalEntries, eq(glJournalEntries.id, glJournalLines.entryId))
    .where(and(eq(glJournalLines.firmId, firmId), eq(glAccounts.code, FLOAT_GL_CODE)))
    .orderBy(desc(glJournalEntries.entryDate))
    .limit(limit);
}

async function postFloatMove(
  firmId: string,
  userId: string,
  direction: "in" | "out",
  cashCode: FloatCashCode,
  amountCents: number,
  memo: string,
  sourceId: string,
  currency?: string,
) {
  const float = await ensureGlAccountByCode(firmId, FLOAT_GL_CODE);
  const cash = await ensureGlAccountByCode(firmId, cashCode);
  const [debit, credit] = direction === "in" ? [float, cash] : [cash, float];
  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: new Date(),
      reference: "Disbursement float",
      memo,
      lines: [
        { accountId: debit.id, debitCents: amountCents, creditCents: 0, currency },
        { accountId: credit.id, debitCents: 0, creditCents: amountCents, currency },
      ],
    },
    "float",
    sourceId,
  );
}

/** Top up the float from the operating bank or business cashbook (e.g. the monthly 400). */
export async function fundFloat(
  firmId: string,
  userId: string,
  input: { amountCents: unknown; fromAccount: unknown; note?: string | null },
) {
  const amountCents = assertAmount(input.amountCents);
  const from = assertCashCode(input.fromAccount);
  return runInTransaction(async () => {
    await lockFloat(firmId);
    const entry = await postFloatMove(
      firmId,
      userId,
      "in",
      from,
      amountCents,
      `Float funded from ${from}${input.note ? `: ${input.note}` : ""}`,
      `fund:${randomUUID()}`,
    );
    return { entry, balanceCents: await getFloatBalanceCents(firmId) };
  });
}

/** Move surplus float back to the cashbook or bank. Managing Partner discretion, with a reason. */
export async function returnFloatExcess(
  firmId: string,
  userId: string,
  input: { amountCents: unknown; toAccount: unknown; reason?: string | null },
  opts: { isManagingPartner: boolean },
) {
  if (!opts.isManagingPartner) {
    throw new AuthError("forbidden", "Only the Managing Partner can move float money back to the cashbook or bank.");
  }
  const reason = input.reason?.trim();
  if (!reason) throw new AuthError("validation", "A reason is required.");
  const amountCents = assertAmount(input.amountCents);
  const to = assertCashCode(input.toAccount);
  return runInTransaction(async () => {
    await lockFloat(firmId);
    const balance = await getFloatBalanceCents(firmId);
    if (amountCents > balance) {
      throw new AuthError("validation", `The float only holds ${balance} cents.`);
    }
    const entry = await postFloatMove(firmId, userId, "out", to, amountCents, `Float excess returned to ${to}: ${reason}`, `return:${randomUUID()}`);
    return { entry, balanceCents: await getFloatBalanceCents(firmId) };
  });
}

/** Recovered advance: the client's repayment (received into cash) goes back into the float. */
export async function returnRecoveryToFloat(
  firmId: string,
  userId: string,
  requisitionId: string,
  amountCents: number,
  receivedInto: FloatCashCode,
  memo: string,
) {
  if (amountCents <= 0) return null;
  return postFloatMove(firmId, userId, "in", receivedInto, amountCents, memo, `recovery:${requisitionId}`);
}

/** Undo a float recovery when the settlement is reversed. */
export async function reverseRecoveryToFloat(firmId: string, userId: string, requisitionId: string, memo: string) {
  return reverseJournalBySource(firmId, userId, "float", `recovery:${requisitionId}`, memo);
}

/** Paying from the float cannot exceed what it holds. */
export async function assertFloatCanPay(firmId: string, amountCents: number) {
  const balance = await getFloatBalanceCents(firmId);
  if (amountCents > balance) {
    throw new AuthError(
      "validation",
      `The disbursement float holds ${(balance / 100).toFixed(2)} but ${(amountCents / 100).toFixed(2)} is needed. Fund the float first, or ask the client to top up trust.`,
    );
  }
}
