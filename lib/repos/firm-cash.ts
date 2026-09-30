import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb, lockFinanceKey, runInTransaction } from "@/lib/db";
import { glAccounts, glJournalEntries, glJournalLines, users } from "@/lib/db/schema";
import { ensureGlAccountByCode } from "@/lib/gl/accounts";
import { postManualJournal, reverseJournalBySource } from "@/lib/gl/journals";

/**
 * Firm money locations (never client trust). Balances always come from the general ledger,
 * so every screen and dashboard shows the same figure.
 */
export const FIRM_CASH_ACCOUNTS = {
  "1010": { label: "Operating Bank", short: "Bank", physical: false },
  "1020": { label: "Business Cash Book", short: "Cash book", physical: true },
  "1050": { label: "Petty Cash", short: "Petty cash", physical: true },
  "1060": { label: "Disbursement Float", short: "Float", physical: true },
} as const;

export type FirmCashCode = keyof typeof FIRM_CASH_ACCOUNTS;
export const FIRM_CASH_CODES = Object.keys(FIRM_CASH_ACCOUNTS) as FirmCashCode[];

/** Firm rule (28 Sep 2026): the disbursement float is topped back up to $400 each month. */
export const FLOAT_MONTHLY_TARGET_CENTS = 40000;

export function isFirmCashCode(code: unknown): code is FirmCashCode {
  return typeof code === "string" && code in FIRM_CASH_ACCOUNTS;
}

export function assertFirmCashCode(code: unknown, label = "Account"): FirmCashCode {
  if (isFirmCashCode(code)) return code;
  throw new AuthError(
    "validation",
    `${label} must be one of: ${FIRM_CASH_CODES.map((c) => `${FIRM_CASH_ACCOUNTS[c].label} (${c})`).join(", ")}.`,
  );
}

export function firmCashLabel(code: string): string {
  return isFirmCashCode(code) ? FIRM_CASH_ACCOUNTS[code].label : code;
}

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function getGlBalanceCents(firmId: string, code: string): Promise<number> {
  const rows = await getDb()
    .select({
      dr: sql<string>`coalesce(sum(${glJournalLines.debitCents}), 0)`,
      cr: sql<string>`coalesce(sum(${glJournalLines.creditCents}), 0)`,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .where(and(eq(glJournalLines.firmId, firmId), eq(glAccounts.code, code)));
  return Number(rows[0]?.dr ?? 0) - Number(rows[0]?.cr ?? 0);
}

export type FirmCashPosition = { code: FirmCashCode; label: string; balanceCents: number };

export async function getFirmCashPositions(firmId: string): Promise<FirmCashPosition[]> {
  const rows = await getDb()
    .select({
      code: glAccounts.code,
      dr: sql<string>`coalesce(sum(${glJournalLines.debitCents}), 0)`,
      cr: sql<string>`coalesce(sum(${glJournalLines.creditCents}), 0)`,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .where(and(eq(glJournalLines.firmId, firmId), inArray(glAccounts.code, FIRM_CASH_CODES)))
    .groupBy(glAccounts.code);
  return FIRM_CASH_CODES.map((code) => {
    const r = rows.find((x) => x.code === code);
    return {
      code,
      label: FIRM_CASH_ACCOUNTS[code].label,
      balanceCents: r ? Number(r.dr) - Number(r.cr) : 0,
    };
  });
}

export type CashMovement = {
  entryId: string;
  entryDate: Date;
  postedAt: Date;
  reference: string | null;
  memo: string | null;
  sourceType: string;
  sourceId: string | null;
  postedBy: string | null;
  inCents: number;
  outCents: number;
  balanceAfterCents: number;
  reversed: boolean;
};

/** Every posting on one firm cash account, newest first, with the running balance after each. */
export async function listCashMovements(firmId: string, code: FirmCashCode, limit = 200): Promise<CashMovement[]> {
  const rows = await getDb()
    .select({
      entryId: glJournalEntries.id,
      entryDate: glJournalEntries.entryDate,
      postedAt: glJournalEntries.postedAt,
      reference: glJournalEntries.reference,
      memo: glJournalEntries.memo,
      sourceType: glJournalEntries.sourceType,
      sourceId: glJournalEntries.sourceId,
      reversedBy: glJournalEntries.reversedByEntryId,
      fullName: users.fullName,
      dr: sql<string>`sum(${glJournalLines.debitCents})`,
      cr: sql<string>`sum(${glJournalLines.creditCents})`,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .innerJoin(glJournalEntries, eq(glJournalEntries.id, glJournalLines.entryId))
    .leftJoin(users, eq(users.id, glJournalEntries.postedBy))
    .where(and(eq(glJournalLines.firmId, firmId), eq(glAccounts.code, code)))
    .groupBy(glJournalEntries.id, users.fullName)
    .orderBy(
      sql`date_trunc('day', ${glJournalEntries.entryDate})`,
      sql`case when ${glJournalEntries.sourceType} = 'opening' then 0 else 1 end`,
      glJournalEntries.postedAt,
    );

  let running = 0;
  const out = rows.map((r) => {
    const inCents = Number(r.dr);
    const outCents = Number(r.cr);
    running += inCents - outCents;
    return {
      entryId: r.entryId,
      entryDate: r.entryDate,
      postedAt: r.postedAt,
      reference: r.reference,
      memo: r.memo,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      postedBy: r.fullName ?? null,
      inCents,
      outCents,
      balanceAfterCents: running,
      reversed: r.reversedBy != null,
    };
  });
  return out.reverse().slice(0, limit);
}

async function lockCash(firmId: string, code: FirmCashCode) {
  await lockFinanceKey(code === "1060" ? `float:${firmId}` : `firmcash:${firmId}:${code}`);
}

/**
 * Physical cash (cash book, petty cash, float) can never be paid out beyond what it holds.
 * The operating bank is not blocked because its opening balance may not be loaded yet.
 */
export async function assertCashCanPay(firmId: string, code: FirmCashCode, amountCents: number) {
  if (!FIRM_CASH_ACCOUNTS[code].physical) return;
  const balance = await getGlBalanceCents(firmId, code);
  if (amountCents > balance) {
    throw new AuthError(
      "validation",
      `${FIRM_CASH_ACCOUNTS[code].label} holds ${dollars(balance)} but ${dollars(amountCents)} is needed.`,
    );
  }
}

/** Lock the account and check the balance, inside the caller's transaction. */
export async function lockAndAssertCashCanPay(firmId: string, code: FirmCashCode, amountCents: number) {
  await lockCash(firmId, code);
  await assertCashCanPay(firmId, code, amountCents);
}

export type TransferInput = {
  fromAccount: unknown;
  toAccount: unknown;
  amountCents: unknown;
  entryDate?: Date | null;
  note?: string | null;
};

/**
 * Move firm money between the operating bank, cash book, petty cash and disbursement float.
 * One balanced journal. Taking money out of the float is Managing Partner only, with a reason.
 */
export async function transferFirmFunds(
  firmId: string,
  userId: string,
  input: TransferInput,
  opts: { isManagingPartner: boolean; currency?: string },
) {
  const from = assertFirmCashCode(input.fromAccount, "From account");
  const to = assertFirmCashCode(input.toAccount, "To account");
  if (from === to) throw new AuthError("validation", "Choose two different accounts.");
  const amountCents = Number(input.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < 1) {
    throw new AuthError("validation", "Amount must be greater than zero.");
  }
  const note = input.note?.trim() || null;
  if (from === "1060") {
    if (!opts.isManagingPartner) {
      throw new AuthError(
        "forbidden",
        "Only the Managing Partner can move money out of the disbursement float.",
      );
    }
    if (!note) throw new AuthError("validation", "A reason is required to move money out of the float.");
  }
  const entryDate = input.entryDate ?? new Date();
  if (entryDate.getTime() > Date.now() + 60_000) {
    throw new AuthError("validation", "A transfer cannot be dated in the future.");
  }

  return runInTransaction(async () => {
    for (const code of [from, to].sort()) await lockCash(firmId, code);
    await assertCashCanPay(firmId, from, amountCents);
    const debit = await ensureGlAccountByCode(firmId, to);
    const credit = await ensureGlAccountByCode(firmId, from);
    const memo = `Funds transfer: ${firmCashLabel(from)} to ${firmCashLabel(to)}${note ? `. ${note}` : ""}`;
    const entry = await postManualJournal(
      firmId,
      userId,
      {
        entryDate,
        reference: "Funds transfer",
        memo,
        lines: [
          { accountId: debit.id, debitCents: amountCents, creditCents: 0, currency: opts.currency },
          { accountId: credit.id, debitCents: 0, creditCents: amountCents, currency: opts.currency },
        ],
      },
      to === "1060" || from === "1060" ? "float" : "funds_transfer",
      `transfer:${randomUUID()}`,
    );
    return { entry, from, to, amountCents };
  });
}

export type TransferRow = {
  entryId: string;
  entryDate: Date;
  memo: string | null;
  sourceType: string;
  sourceId: string;
  fromCode: string;
  toCode: string;
  amountCents: number;
  postedBy: string | null;
  reversed: boolean;
  isReversal: boolean;
};

/** Transfers between firm cash accounts (including float top-ups and returns), newest first. */
export async function listFirmTransfers(firmId: string, limit = 100): Promise<TransferRow[]> {
  const db = getDb();
  const entries = await db
    .select({
      id: glJournalEntries.id,
      entryDate: glJournalEntries.entryDate,
      memo: glJournalEntries.memo,
      sourceType: glJournalEntries.sourceType,
      sourceId: glJournalEntries.sourceId,
      reversedBy: glJournalEntries.reversedByEntryId,
      fullName: users.fullName,
    })
    .from(glJournalEntries)
    .leftJoin(users, eq(users.id, glJournalEntries.postedBy))
    .where(
      and(
        eq(glJournalEntries.firmId, firmId),
        inArray(glJournalEntries.sourceType, ["funds_transfer", "float"]),
        sql`(${glJournalEntries.sourceId} like 'transfer:%' or ${glJournalEntries.sourceId} like 'fund:%' or ${glJournalEntries.sourceId} like 'return:%')`,
      ),
    )
    .orderBy(desc(glJournalEntries.postedAt))
    .limit(limit);
  if (!entries.length) return [];
  const lines = await db
    .select({
      entryId: glJournalLines.entryId,
      code: glAccounts.code,
      dr: glJournalLines.debitCents,
      cr: glJournalLines.creditCents,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .where(inArray(glJournalLines.entryId, entries.map((e) => e.id)));
  return entries.map((e) => {
    const mine = lines.filter((l) => l.entryId === e.id);
    const debit = mine.find((l) => l.dr > 0);
    const credit = mine.find((l) => l.cr > 0);
    return {
      entryId: e.id,
      entryDate: e.entryDate,
      memo: e.memo,
      sourceType: e.sourceType,
      sourceId: e.sourceId ?? "",
      fromCode: credit?.code ?? "",
      toCode: debit?.code ?? "",
      amountCents: debit?.dr ?? 0,
      postedBy: e.fullName ?? null,
      reversed: e.reversedBy != null,
      isReversal: (e.sourceId ?? "").includes(":rev:"),
    };
  });
}

/** Undo a transfer with an equal and opposite journal. Managing Partner only, with a reason. */
export async function reverseFirmTransfer(
  firmId: string,
  userId: string,
  entryId: string,
  reason: string | null | undefined,
  opts: { isManagingPartner: boolean },
) {
  if (!opts.isManagingPartner) {
    throw new AuthError("forbidden", "Only the Managing Partner can reverse a funds transfer.");
  }
  const why = reason?.trim();
  if (!why) throw new AuthError("validation", "A reason is required to reverse a transfer.");
  const [row] = (await listFirmTransfers(firmId, 500)).filter((t) => t.entryId === entryId);
  if (!row) throw new AuthError("not_found", "Transfer not found.");
  if (row.isReversal) throw new AuthError("validation", "This entry is itself a reversal.");
  if (row.reversed) throw new AuthError("validation", "This transfer has already been reversed.");
  const to = assertFirmCashCode(row.toCode);
  const from = assertFirmCashCode(row.fromCode);

  return runInTransaction(async () => {
    for (const code of [from, to].sort()) await lockCash(firmId, code);
    await assertCashCanPay(firmId, to, row.amountCents);
    const live = await getDb()
      .select({ id: glJournalEntries.id })
      .from(glJournalEntries)
      .where(and(eq(glJournalEntries.id, entryId), isNull(glJournalEntries.reversedByEntryId)))
      .limit(1);
    if (!live[0]) throw new AuthError("validation", "This transfer has already been reversed.");
    const reversal = await reverseJournalBySource(
      firmId,
      userId,
      row.sourceType as "funds_transfer" | "float",
      row.sourceId,
      `Reversal of funds transfer (${firmCashLabel(from)} to ${firmCashLabel(to)}): ${why}`,
    );
    if (!reversal) throw new AuthError("validation", "Nothing to reverse.");
    return { reversal, row };
  });
}
