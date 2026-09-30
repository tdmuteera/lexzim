/**
 * Firm expenses and business cashbook (Phase 6 P6-09). Never trust.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb, runInTransaction } from "@/lib/db";
import {
  businessCashbookEntries,
  feePayments,
  financeRequisitions,
  firmExpenses,
  matters,
} from "@/lib/db/schema";
import type { CashbookEntryInput, ExpenseInput } from "@/lib/finance/firm-finance-validation";
import { resolveExpenseGlAccountId } from "@/lib/finance/expense-gl-tree";
import { reverseJournalBySource } from "@/lib/gl/journals";
import { expenseCashCode, postFirmExpenseGl } from "@/lib/gl/posting-expenses";
import { lockAndAssertCashCanPay } from "@/lib/repos/firm-cash";

export async function listFirmExpenses(
  firmId: string,
  opts?: { from?: Date; to?: Date; category?: string },
) {
  const db = getDb();
  const conditions = [eq(firmExpenses.firmId, firmId)];
  if (opts?.from) conditions.push(gte(firmExpenses.expenseDate, opts.from));
  if (opts?.to) conditions.push(lte(firmExpenses.expenseDate, opts.to));
  if (opts?.category) conditions.push(eq(firmExpenses.category, opts.category));

  return db
    .select({
      expense: firmExpenses,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(firmExpenses)
    .leftJoin(matters, and(eq(matters.id, firmExpenses.matterId), eq(matters.firmId, firmId)))
    .where(and(...conditions))
    .orderBy(desc(firmExpenses.expenseDate), desc(firmExpenses.createdAt))
    .limit(200);
}

export async function getFirmExpense(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      expense: firmExpenses,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(firmExpenses)
    .leftJoin(matters, and(eq(matters.id, firmExpenses.matterId), eq(matters.firmId, firmId)))
    .where(and(eq(firmExpenses.firmId, firmId), eq(firmExpenses.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createFirmExpense(firmId: string, userId: string, input: ExpenseInput) {
  const { assertPeriodNotLocked } = await import("@/lib/repos/period-locks");
  await assertPeriodNotLocked(firmId, input.expenseDate);

  const glAccountId =
    input.glAccountId ?? (await resolveExpenseGlAccountId(firmId, input.category));

  return runInTransaction(async () => {
    if (input.paymentSource !== "ap") {
      await lockAndAssertCashCanPay(firmId, expenseCashCode(input.paymentSource), input.amountCents);
    }
    const rows = await getDb()
      .insert(firmExpenses)
      .values({
        firmId,
        expenseDate: input.expenseDate,
        category: input.category,
        payee: input.payee,
        amountCents: input.amountCents,
        currency: input.currency,
        matterId: input.matterId,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        glAccountId,
        paymentSource: input.paymentSource,
        budgetMonth: input.budgetMonth,
        createdBy: userId,
        updatedAt: new Date(),
      })
      .returning();
    const expense = rows[0]!;
    if (input.paymentSource !== "ap") {
      await postFirmExpenseGl(firmId, userId, expense.id);
    }
    return expense;
  });
}

async function assertExpenseNotFromRequisition(firmId: string, id: string) {
  const linked = await getDb()
    .select({ id: financeRequisitions.id })
    .from(financeRequisitions)
    .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.expenseId, id)))
    .limit(1);
  if (linked[0]) {
    throw new AuthError(
      "validation",
      "This expense was paid through a requisition. Reverse the requisition payment instead.",
    );
  }
}

/** Edits re-post GL: the old journal is reversed and the corrected one posted. */
export async function updateFirmExpense(
  firmId: string,
  id: string,
  input: ExpenseInput,
  userId?: string,
) {
  const { assertPeriodNotLocked } = await import("@/lib/repos/period-locks");
  await assertPeriodNotLocked(firmId, input.expenseDate);

  return runInTransaction(async () => {
    const before = await getFirmExpense(firmId, id);
    if (!before) return null;
    const moneyChanged =
      before.expense.amountCents !== input.amountCents ||
      before.expense.paymentSource !== input.paymentSource ||
      before.expense.category !== input.category ||
      (input.glAccountId != null && before.expense.glAccountId !== input.glAccountId) ||
      before.expense.expenseDate.getTime() !== input.expenseDate.getTime();
    if (moneyChanged) await assertExpenseNotFromRequisition(firmId, id);

    const db = getDb();
    const rows = await db
      .update(firmExpenses)
      .set({
        expenseDate: input.expenseDate,
        category: input.category,
        payee: input.payee,
        amountCents: input.amountCents,
        currency: input.currency,
        matterId: input.matterId,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        glAccountId: input.glAccountId ?? undefined,
        paymentSource: input.paymentSource,
        budgetMonth: input.budgetMonth,
        updatedAt: new Date(),
      })
      .where(and(eq(firmExpenses.firmId, firmId), eq(firmExpenses.id, id)))
      .returning();
    const updated = rows[0] ?? null;
    const actor = userId ?? before.expense.createdBy;
    if (updated && moneyChanged && actor) {
      await reverseJournalBySource(firmId, actor, "expense", id, `Expense corrected: ${updated.payee}`);
      if (updated.paymentSource !== "ap") {
        await lockAndAssertCashCanPay(firmId, expenseCashCode(updated.paymentSource), updated.amountCents);
        await postFirmExpenseGl(firmId, actor, id);
      }
    }
    return updated;
  });
}

/** Deleting an expense also reverses its GL posting so the books stay balanced. */
export async function deleteFirmExpense(firmId: string, id: string, userId?: string) {
  return runInTransaction(async () => {
    await assertExpenseNotFromRequisition(firmId, id);
    const before = await getFirmExpense(firmId, id);
    if (!before) return null;
    const actor = userId ?? before.expense.createdBy;
    if (actor) {
      await reverseJournalBySource(firmId, actor, "expense", id, `Expense deleted: ${before.expense.payee}`);
    }
    const rows = await getDb()
      .delete(firmExpenses)
      .where(and(eq(firmExpenses.firmId, firmId), eq(firmExpenses.id, id)))
      .returning();
    return rows[0] ?? null;
  });
}

/** Contra expense row plus GL reversal; the original expense stays on record. */
export async function reverseFirmExpense(
  firmId: string,
  userId: string,
  id: string,
  reason: string,
) {
  const before = await getFirmExpense(firmId, id);
  if (!before) throw new AuthError("not_found", "Expense not found.");
  const e = before.expense;
  await getDb().insert(firmExpenses).values({
    firmId,
    expenseDate: new Date(),
    category: e.category,
    payee: e.payee,
    amountCents: -e.amountCents,
    currency: e.currency,
    matterId: e.matterId,
    paymentMethod: e.paymentMethod,
    notes: `Reversal of expense ${id.slice(0, 8)}: ${reason.trim()}`,
    glAccountId: e.glAccountId,
    paymentSource: e.paymentSource,
    budgetMonth: e.budgetMonth,
    createdBy: userId,
    updatedAt: new Date(),
  });
  await reverseJournalBySource(firmId, userId, "expense", id, `Expense reversal: ${reason.trim()}`);
}

export async function listCashbookEntries(
  firmId: string,
  opts?: { from?: Date; to?: Date; bankAccountLabel?: string },
) {
  const db = getDb();
  const conditions = [eq(businessCashbookEntries.firmId, firmId)];
  if (opts?.from) conditions.push(gte(businessCashbookEntries.entryDate, opts.from));
  if (opts?.to) conditions.push(lte(businessCashbookEntries.entryDate, opts.to));
  if (opts?.bankAccountLabel) {
    conditions.push(eq(businessCashbookEntries.bankAccountLabel, opts.bankAccountLabel));
  }

  return db
    .select()
    .from(businessCashbookEntries)
    .where(and(...conditions))
    .orderBy(desc(businessCashbookEntries.entryDate), desc(businessCashbookEntries.createdAt))
    .limit(200);
}

export async function createCashbookEntry(
  firmId: string,
  userId: string,
  input: CashbookEntryInput,
) {
  const { assertPeriodNotLocked } = await import("@/lib/repos/period-locks");
  await assertPeriodNotLocked(firmId, input.entryDate);

  if (input.expenseId) {
    const expense = await getFirmExpense(firmId, input.expenseId);
    if (!expense) {
      throw new AuthError("validation", "Linked expense not found.");
    }
  }
  if (input.feePaymentId) {
    const db = getDb();
    const fp = await db
      .select()
      .from(feePayments)
      .where(and(eq(feePayments.firmId, firmId), eq(feePayments.id, input.feePaymentId)))
      .limit(1);
    if (!fp[0]) {
      throw new AuthError("validation", "Linked fee payment not found.");
    }
  }

  const db = getDb();
  const rows = await db
    .insert(businessCashbookEntries)
    .values({
      firmId,
      entryDate: input.entryDate,
      entryType: input.entryType,
      amountCents: input.amountCents,
      currency: input.currency,
      reference: input.reference,
      bankAccountLabel: input.bankAccountLabel,
      expenseId: input.expenseId,
      feePaymentId: input.feePaymentId,
      notes: input.notes,
      createdBy: userId,
    })
    .returning();
  return rows[0]!;
}

export async function deleteCashbookEntry(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .delete(businessCashbookEntries)
    .where(and(eq(businessCashbookEntries.firmId, firmId), eq(businessCashbookEntries.id, id)))
    .returning();
  return rows[0] ?? null;
}

/** Business operating account book balance from cashbook (in minus out). */
export async function getBusinessCashbookBalance(
  firmId: string,
  opts?: { bankAccountLabel?: string; asOf?: Date },
): Promise<number> {
  const db = getDb();
  const conditions = [eq(businessCashbookEntries.firmId, firmId)];
  if (opts?.bankAccountLabel) {
    conditions.push(eq(businessCashbookEntries.bankAccountLabel, opts.bankAccountLabel));
  }
  if (opts?.asOf) {
    conditions.push(lte(businessCashbookEntries.entryDate, opts.asOf));
  }

  const rows = await db
    .select({
      entryType: businessCashbookEntries.entryType,
      total: sql<number>`coalesce(sum(${businessCashbookEntries.amountCents}), 0)::int`,
    })
    .from(businessCashbookEntries)
    .where(and(...conditions))
    .groupBy(businessCashbookEntries.entryType);

  let balance = 0;
  for (const row of rows) {
    const total = Number(row.total) || 0;
    if (row.entryType === "in") balance += total;
    else balance -= total;
  }
  return balance;
}

export async function listRecentFeePaymentsForLink(firmId: string, limit = 30) {
  const db = getDb();
  return db
    .select({
      id: feePayments.id,
      amountCents: feePayments.amountCents,
      currency: feePayments.currency,
      paidAt: feePayments.paidAt,
      reference: feePayments.reference,
      invoiceId: feePayments.invoiceId,
    })
    .from(feePayments)
    .where(eq(feePayments.firmId, firmId))
    .orderBy(desc(feePayments.paidAt))
    .limit(limit);
}
