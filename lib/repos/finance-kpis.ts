/**
 * Finance KPI aggregates (Phase 6 P6-11).
 */
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { monthBoundsUtc, PL_INCOME_BASIS } from "@/lib/finance/pl-definition";
import { getDb } from "@/lib/db";
import { invoices, matters } from "@/lib/db/schema";
import { sumFeePaymentsInPeriod } from "@/lib/repos/billing";
import { listDebtors } from "@/lib/repos/debtors";
import {
  getBusinessCashbookBalance,
  listFirmExpenses,
} from "@/lib/repos/firm-finance";
import { listReconciliationRuns } from "@/lib/repos/reconciliation";
import { getTrustOverview } from "@/lib/repos/trust";

const DEFAULT_BUSINESS_BANK_LABEL = "Business operating account";

export type FinanceKpis = {
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  currency: string;
  feesBilledCents: number;
  feesCollectedCents: number;
  feesBilledInvoiceCount: number;
  feesCollectedPaymentCount: number;
  debtorsOver30Cents: number;
  debtorsOver60Cents: number;
  debtorsOver90Cents: number;
  debtorsOver30Count: number;
  debtorsOver60Count: number;
  debtorsOver90Count: number;
  businessBankBookCents: number;
  businessBankStatementCents: number | null;
  businessBankLabel: string;
  trustVaultCents: number;
  monthlyExpensesCents: number;
  monthlyExpenseCount: number;
  monthlyProfitCents: number;
  profitIncomeBasis: typeof PL_INCOME_BASIS;
  mattersOpened: number;
  mattersClosed: number;
};

function periodLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

async function sumInvoicesBilledInPeriod(
  firmId: string,
  from: Date,
  to: Date,
  defaultCurrency = "USD",
): Promise<{ totalCents: number; count: number; currency: string }> {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
      currency: invoices.currency,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.firmId, firmId),
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    )
    .groupBy(invoices.currency);

  const primary =
    rows.find((r) => r.currency === defaultCurrency) ?? rows[0];
  return {
    totalCents: primary ? Number(primary.total) || 0 : 0,
    count: primary ? Number(primary.count) || 0 : 0,
    currency: primary?.currency ?? defaultCurrency,
  };
}

async function countMattersOpenedClosed(
  firmId: string,
  from: Date,
  to: Date,
): Promise<{ opened: number; closed: number }> {
  const db = getDb();

  const [openedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matters)
    .where(
      and(
        eq(matters.firmId, firmId),
        gte(matters.openedAt, from),
        lte(matters.openedAt, to),
      ),
    );

  const [closedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matters)
    .where(
      and(
        eq(matters.firmId, firmId),
        gte(matters.closedAt, from),
        lte(matters.closedAt, to),
      ),
    );

  return {
    opened: openedRow?.count ?? 0,
    closed: closedRow?.count ?? 0,
  };
}

function debtorsBucketTotals(
  rows: Awaited<ReturnType<typeof listDebtors>>["rows"],
) {
  let over30Cents = 0;
  let over60Cents = 0;
  let over90Cents = 0;
  let over30Count = 0;
  let over60Count = 0;
  let over90Count = 0;

  for (const row of rows) {
    if (row.balanceCents <= 0) continue;
    const bucket = row.bucket;
    if (bucket === "31-60" || bucket === "61-90" || bucket === "90+") {
      over30Cents += row.balanceCents;
      over30Count += 1;
    }
    if (bucket === "61-90" || bucket === "90+") {
      over60Cents += row.balanceCents;
      over60Count += 1;
    }
    if (bucket === "90+") {
      over90Cents += row.balanceCents;
      over90Count += 1;
    }
  }

  return {
    over30Cents,
    over60Cents,
    over90Cents,
    over30Count,
    over60Count,
    over90Count,
  };
}

export async function getFinanceKpis(
  firmId: string,
  opts: {
    userId: string;
    viewAll: boolean;
    periodYear?: number;
    periodMonth?: number;
    defaultCurrency?: string;
  },
): Promise<FinanceKpis> {
  const now = new Date();
  const periodYear = opts.periodYear ?? now.getFullYear();
  const periodMonth = opts.periodMonth ?? now.getMonth() + 1;
  const defaultCurrency = opts.defaultCurrency ?? "USD";
  const { from, to } = monthBoundsUtc(periodYear, periodMonth);

  const [
    debtorsReport,
    billed,
    collectedRows,
    expenseRows,
    trustOverview,
    bookBalance,
    reconRows,
    matterCounts,
  ] = await Promise.all([
    listDebtors(firmId, {
      userId: opts.userId,
      viewAll: opts.viewAll,
    }),
    sumInvoicesBilledInPeriod(firmId, from, to, defaultCurrency),
    sumFeePaymentsInPeriod(firmId, from, to),
    listFirmExpenses(firmId, { from, to }),
    getTrustOverview(firmId),
    getBusinessCashbookBalance(firmId, { bankAccountLabel: DEFAULT_BUSINESS_BANK_LABEL }),
    listReconciliationRuns(firmId, {
      reconType: "business_bank",
      status: "completed",
    }),
    countMattersOpenedClosed(firmId, from, to),
  ]);

  const debtors = debtorsBucketTotals(debtorsReport.rows);

  const collected =
    collectedRows.find((r) => r.currency === defaultCurrency) ??
    collectedRows[0] ??
    { totalCents: 0, paymentCount: 0, currency: defaultCurrency };

  let expenseTotal = 0;
  for (const row of expenseRows) {
    if (row.expense.currency === defaultCurrency) {
      expenseTotal += row.expense.amountCents;
    }
  }

  const vaultCents = trustOverview.accounts
    .filter((a) => a.accountKind === "vault")
    .reduce((sum, a) => sum + a.balanceCents, 0);

  const lastBusinessRecon = reconRows.find(
    (r) => r.run.bankAccountLabel === DEFAULT_BUSINESS_BANK_LABEL,
  );

  const feesBilledCents = billed.totalCents;
  const currency = billed.currency;

  return {
    periodYear,
    periodMonth,
    periodLabel: periodLabel(periodYear, periodMonth),
    currency,
    feesBilledCents,
    feesCollectedCents: collected.totalCents,
    feesBilledInvoiceCount: billed.count,
    feesCollectedPaymentCount: collected.paymentCount,
    debtorsOver30Cents: debtors.over30Cents,
    debtorsOver60Cents: debtors.over60Cents,
    debtorsOver90Cents: debtors.over90Cents,
    debtorsOver30Count: debtors.over30Count,
    debtorsOver60Count: debtors.over60Count,
    debtorsOver90Count: debtors.over90Count,
    businessBankBookCents: bookBalance,
    businessBankStatementCents: lastBusinessRecon?.run.statementBalanceCents ?? null,
    businessBankLabel: DEFAULT_BUSINESS_BANK_LABEL,
    trustVaultCents: vaultCents,
    monthlyExpensesCents: expenseTotal,
    monthlyExpenseCount: expenseRows.filter((r) => r.expense.currency === defaultCurrency).length,
    monthlyProfitCents: collected.totalCents - expenseTotal,
    profitIncomeBasis: PL_INCOME_BASIS,
    mattersOpened: matterCounts.opened,
    mattersClosed: matterCounts.closed,
  };
}
