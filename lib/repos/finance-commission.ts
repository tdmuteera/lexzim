/**
 * Lawyer commission on collected fee revenue above a monthly target (P11-10).
 * Basis matches lawyer-performance: fee_payments cash attributed to matter responsible lawyer.
 * Trust deposits and disbursements are excluded. Not payroll.
 */
import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { financeCommissionSettings } from "@/lib/db/schema";
import {
  COMMISSION_FORMULA_HELP,
  calendarMonthRange,
  computeCommissionMetrics,
  type CommissionMetrics,
} from "@/lib/finance/commission-formula";
import {
  LAWYER_REVENUE_POLICY,
  listRevenueByLawyer,
} from "@/lib/repos/lawyer-performance";

export {
  COMMISSION_FORMULA_HELP,
  calendarMonthRange,
  computeCommissionMetrics,
  currentYearMonth,
} from "@/lib/finance/commission-formula";
export type { CommissionMetrics } from "@/lib/finance/commission-formula";

export type CommissionSettingsRow = {
  id: string;
  firmId: string;
  monthlyTargetCents: number;
  currency: string;
  commissionPercentAboveTarget: number;
  effectiveFrom: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CommissionLawyerRow = CommissionMetrics & {
  lawyerId: string | null;
  lawyerName: string;
};

export type CommissionMonthReport = {
  month: string;
  from: string;
  to: string;
  currency: string;
  settings: CommissionSettingsRow | null;
  formulaHelp: string;
  attributionPolicy: string;
  configured: boolean;
  rows: CommissionLawyerRow[];
  totals: CommissionMetrics;
};

function serializeSettings(
  row: typeof financeCommissionSettings.$inferSelect,
): CommissionSettingsRow {
  return {
    id: row.id,
    firmId: row.firmId,
    monthlyTargetCents: row.monthlyTargetCents,
    currency: row.currency,
    commissionPercentAboveTarget: row.commissionPercentAboveTarget,
    effectiveFrom: String(row.effectiveFrom),
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Latest settings with effectiveFrom on or before asOf (date-only). */
export async function getActiveCommissionSettings(
  firmId: string,
  asOf: Date = new Date(),
): Promise<CommissionSettingsRow | null> {
  const db = getDb();
  const asOfDate = asOf.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(financeCommissionSettings)
    .where(
      and(
        eq(financeCommissionSettings.firmId, firmId),
        lte(financeCommissionSettings.effectiveFrom, asOfDate),
      ),
    )
    .orderBy(
      desc(financeCommissionSettings.effectiveFrom),
      desc(financeCommissionSettings.updatedAt),
    )
    .limit(1);
  return rows[0] ? serializeSettings(rows[0]) : null;
}

/** Most recent settings row for the firm (even if effectiveFrom is in the future). */
export async function getLatestCommissionSettings(
  firmId: string,
): Promise<CommissionSettingsRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(financeCommissionSettings)
    .where(eq(financeCommissionSettings.firmId, firmId))
    .orderBy(
      desc(financeCommissionSettings.effectiveFrom),
      desc(financeCommissionSettings.updatedAt),
    )
    .limit(1);
  return rows[0] ? serializeSettings(rows[0]) : null;
}

export async function saveCommissionSettings(input: {
  firmId: string;
  monthlyTargetCents: number;
  currency: string;
  commissionPercentAboveTarget: number;
  effectiveFrom: string;
  updatedBy: string;
}): Promise<CommissionSettingsRow> {
  if (!Number.isFinite(input.monthlyTargetCents) || input.monthlyTargetCents < 0) {
    throw new Error("monthlyTargetCents must be a non-negative integer.");
  }
  if (
    !Number.isFinite(input.commissionPercentAboveTarget) ||
    input.commissionPercentAboveTarget < 0 ||
    input.commissionPercentAboveTarget > 100
  ) {
    throw new Error("commissionPercentAboveTarget must be between 0 and 100.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new Error("effectiveFrom must be YYYY-MM-DD.");
  }

  const db = getDb();
  const [row] = await db
    .insert(financeCommissionSettings)
    .values({
      firmId: input.firmId,
      monthlyTargetCents: Math.round(input.monthlyTargetCents),
      currency: (input.currency || "USD").trim().toUpperCase() || "USD",
      commissionPercentAboveTarget: input.commissionPercentAboveTarget,
      effectiveFrom: input.effectiveFrom,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .returning();

  return serializeSettings(row);
}

export async function buildCommissionMonthReport(input: {
  firmId: string;
  yearMonth: string;
  currencyFallback: string;
}): Promise<CommissionMonthReport> {
  const { from, to, month } = calendarMonthRange(input.yearMonth);
  const settings = await getActiveCommissionSettings(input.firmId, to);
  const revenue = await listRevenueByLawyer(input.firmId, from, to);

  const monthlyTargetCents = settings?.monthlyTargetCents ?? 0;
  const pct = settings?.commissionPercentAboveTarget ?? 0;
  const currency = settings?.currency ?? input.currencyFallback;

  const rows: CommissionLawyerRow[] = revenue.map((r) => ({
    lawyerId: r.lawyerId,
    lawyerName: r.lawyerName,
    ...computeCommissionMetrics({
      collectedCents: r.collectedCents,
      monthlyTargetCents,
      commissionPercentAboveTarget: pct,
    }),
  }));

  const collectedTotal = rows.reduce((s, r) => s + r.collectedCents, 0);
  const totals = computeCommissionMetrics({
    collectedCents: collectedTotal,
    monthlyTargetCents,
    commissionPercentAboveTarget: pct,
  });

  return {
    month,
    from: from.toISOString(),
    to: to.toISOString(),
    currency,
    settings,
    formulaHelp: COMMISSION_FORMULA_HELP,
    attributionPolicy: LAWYER_REVENUE_POLICY,
    configured: Boolean(settings),
    rows,
    totals,
  };
}
