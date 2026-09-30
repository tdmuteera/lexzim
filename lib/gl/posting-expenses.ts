import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { firmExpenses, glJournalEntries } from "@/lib/db/schema";
import { ensureGlAccountByCode, getGlAccount } from "@/lib/gl/accounts";
import { postManualJournal } from "@/lib/gl/journals";
import { resolveExpenseGlAccountId } from "@/lib/finance/expense-gl-tree";

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

/** Firm cash account an expense is paid from: petty cash, the cash book, or the operating bank. */
export function expenseCashCode(paymentSource: string): "1010" | "1020" | "1050" {
  if (paymentSource === "petty") return "1050";
  if (paymentSource === "cashbook") return "1020";
  return "1010";
}

/** Post firm expense: Dr expense, Cr the cash account it was paid from. */
export async function postFirmExpenseGl(
  firmId: string,
  userId: string,
  expenseId: string,
) {
  const existing = await findPostedJournal(firmId, "expense", expenseId);
  if (existing) return existing;

  const db = getDb();
  const rows = await db
    .select()
    .from(firmExpenses)
    .where(and(eq(firmExpenses.firmId, firmId), eq(firmExpenses.id, expenseId)))
    .limit(1);
  const expense = rows[0];
  if (!expense) throw new AuthError("not_found", "Expense not found.");
  if (expense.paymentSource === "ap") {
    return null;
  }

  const expenseAccountId =
    expense.glAccountId ?? (await resolveExpenseGlAccountId(firmId, expense.category));
  const expenseAccount = await getGlAccount(firmId, expenseAccountId);
  if (!expenseAccount) {
    throw new AuthError("validation", "Expense GL account not found.");
  }

  const cashAccount = await ensureGlAccountByCode(firmId, expenseCashCode(expense.paymentSource));

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: expense.expenseDate,
      reference: expense.payee,
      memo: `Firm expense: ${expense.payee}`,
      lines: [
        {
          accountId: expenseAccount.id,
          debitCents: expense.amountCents,
          creditCents: 0,
          matterId: expense.matterId,
          currency: expense.currency,
          lineMemo: expense.notes ?? undefined,
        },
        {
          accountId: cashAccount.id,
          debitCents: 0,
          creditCents: expense.amountCents,
          currency: expense.currency,
        },
      ],
    },
    "expense",
    expenseId,
  );
}
