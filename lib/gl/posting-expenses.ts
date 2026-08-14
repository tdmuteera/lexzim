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

/** Post firm expense paid from cash: Dr expense, Cr operating bank. */
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

  const cashAccount =
    expense.paymentSource === "petty"
      ? await ensureGlAccountByCode(firmId, "1050")
      : await ensureGlAccountByCode(firmId, "1010");

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
