/**
 * Pure lawyer commission math (P11-10). No DB imports.
 * Commission due = (collected fee cash above monthly target) × percent.
 */

export const COMMISSION_FORMULA_HELP =
  "Commission due = (collected fee cash above the monthly target) × commission %. Collected uses fee receipts (fee_payments) in the selected calendar month, attributed to each matter's current responsible lawyer — the same basis as Lawyer Performance. Trust deposits and disbursements do not count. This is not payroll and does not post salary.";

export type CommissionMetrics = {
  collectedCents: number;
  monthlyTargetCents: number;
  remainingToTargetCents: number;
  aboveTargetCents: number;
  commissionDueCents: number;
  commissionPercentAboveTarget: number;
};

export function computeCommissionMetrics(input: {
  collectedCents: number;
  monthlyTargetCents: number;
  commissionPercentAboveTarget: number;
}): CommissionMetrics {
  const collectedCents = Math.max(0, Math.round(input.collectedCents));
  const monthlyTargetCents = Math.max(0, Math.round(input.monthlyTargetCents));
  const pct = Number.isFinite(input.commissionPercentAboveTarget)
    ? input.commissionPercentAboveTarget
    : 0;
  const remainingToTargetCents = Math.max(0, monthlyTargetCents - collectedCents);
  const aboveTargetCents = Math.max(0, collectedCents - monthlyTargetCents);
  const commissionDueCents = Math.round(aboveTargetCents * (pct / 100));
  return {
    collectedCents,
    monthlyTargetCents,
    remainingToTargetCents,
    aboveTargetCents,
    commissionDueCents,
    commissionPercentAboveTarget: pct,
  };
}

/** Parse YYYY-MM into inclusive local month bounds. */
export function calendarMonthRange(yearMonth: string): { from: Date; to: Date; month: string } {
  const m = yearMonth.trim();
  if (!/^\d{4}-\d{2}$/.test(m)) {
    throw new Error("month must be YYYY-MM");
  }
  const year = Number(m.slice(0, 4));
  const monthIndex = Number(m.slice(5, 7)) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error("month must be YYYY-MM");
  }
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { from, to, month: m };
}

export function currentYearMonth(now = new Date()): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}
