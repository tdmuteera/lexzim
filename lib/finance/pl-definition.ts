/**
 * Simple P&L policy for Phase 6 finance reports (P6-10).
 *
 * Income: fee payments received in the period (`fee_payments.paid_at`).
 * Expenses: firm operating expenses dated in the period (`firm_expenses.expense_date`).
 * Profit: income minus expenses (same currency rows summed per currency; UI defaults to firm currency).
 *
 * Accrual (invoices sent but unpaid) is shown separately as debtors / outstanding AR, not P&L income.
 */
export const PL_INCOME_BASIS = "payments_received" as const;

export const PL_DEFINITION_NOTE =
  "Fee income is cash received on fee invoices in the period. Expenses are firm operating costs dated in the period. Trust movements are excluded.";

export function monthBoundsUtc(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
}
