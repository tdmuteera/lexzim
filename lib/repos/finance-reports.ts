/**
 * Finance reports pack (Phase 6 P6-10).
 */
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance/expense-categories";
import {
  monthBoundsUtc,
  PL_DEFINITION_NOTE,
  PL_INCOME_BASIS,
} from "@/lib/finance/pl-definition";
import { toCsv } from "@/lib/reports/csv";
import { sumFeePaymentsInPeriod } from "@/lib/repos/billing";
import { listDebtors, type DebtorsReport } from "@/lib/repos/debtors";
import {
  getBusinessCashbookBalance,
  listFirmExpenses,
} from "@/lib/repos/firm-finance";
import { getPeriodLock } from "@/lib/repos/period-locks";
import { listReconciliationRuns } from "@/lib/repos/reconciliation";
import { getTrustOverview, type TrustOverview } from "@/lib/repos/trust";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { firmAssets } from "@/lib/db/schema";

const DEFAULT_BUSINESS_BANK_LABEL = "Business operating account";

export type OutstandingInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  clientName: string;
  matterTitle: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  totalCents: number;
  balanceCents: number;
};

export type BusinessCashbookSnapshot = {
  bankAccountLabel: string;
  bookBalanceCents: number;
  lastRecon: {
    id: string;
    periodYear: number;
    periodMonth: number;
    statementBalanceCents: number;
    ledgerBalanceCents: number;
    varianceCents: number;
    status: string;
    completedAt: string | null;
  } | null;
  statementVsBookVarianceCents: number | null;
};

export type WeeklyFinancePack = {
  pack: "weekly";
  asOf: string;
  debtors: DebtorsReport;
  outstandingInvoices: OutstandingInvoiceRow[];
  trustSnapshot: TrustOverview;
  businessCashbook: BusinessCashbookSnapshot;
};

export type ReconRunSummary = {
  id: string;
  reconType: string;
  periodYear: number;
  periodMonth: number;
  trustAccountName: string | null;
  bankAccountLabel: string | null;
  statementBalanceCents: number;
  ledgerBalanceCents: number;
  varianceCents: number;
  status: string;
  completedAt: string | null;
  completedByName: string | null;
};

export type MonthlyExpenseSummary = {
  totalCents: number;
  currency: string;
  count: number;
  byCategory: Array<{ category: string; label: string; totalCents: number; count: number }>;
  items: Array<{
    id: string;
    expenseDate: string;
    category: string;
    categoryLabel: string;
    payee: string;
    amountCents: number;
    currency: string;
  }>;
};

export type ProfitAndLoss = {
  incomeBasis: typeof PL_INCOME_BASIS;
  note: string;
  periodYear: number;
  periodMonth: number;
  currency: string;
  feeIncomeCents: number;
  feePaymentCount: number;
  expenseTotalCents: number;
  expenseCount: number;
  profitCents: number;
  byCurrency: Array<{
    currency: string;
    feeIncomeCents: number;
    expenseTotalCents: number;
    profitCents: number;
  }>;
};

export type FirmAssetRow = {
  id: string;
  description: string;
  acquiredDate: string;
  costCents: number;
  currency: string;
  notes: string | null;
};

export type MonthlyFinancePack = {
  pack: "monthly";
  periodYear: number;
  periodMonth: number;
  businessBankRecons: ReconRunSummary[];
  trustRecons: ReconRunSummary[];
  expenses: MonthlyExpenseSummary;
  profitAndLoss: ProfitAndLoss;
  periodLock: {
    locked: boolean;
    lockedAt: string | null;
    lockedByName: string | null;
  };
  assets: FirmAssetRow[];
};

function serializeReconRun(
  row: Awaited<ReturnType<typeof listReconciliationRuns>>[number],
): ReconRunSummary {
  return {
    id: row.run.id,
    reconType: row.run.reconType,
    periodYear: row.run.periodYear,
    periodMonth: row.run.periodMonth,
    trustAccountName: row.trustAccountName,
    bankAccountLabel: row.run.bankAccountLabel,
    statementBalanceCents: row.run.statementBalanceCents,
    ledgerBalanceCents: row.run.ledgerBalanceCents,
    varianceCents: row.run.varianceCents,
    status: row.run.status,
    completedAt: row.run.completedAt?.toISOString() ?? null,
    completedByName: row.completedByName,
  };
}

async function listFirmAssets(firmId: string): Promise<FirmAssetRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(firmAssets)
    .where(eq(firmAssets.firmId, firmId))
    .orderBy(desc(firmAssets.acquiredDate))
    .limit(100);
  return rows.map((a) => ({
    id: a.id,
    description: a.description,
    acquiredDate: a.acquiredDate.toISOString(),
    costCents: a.costCents,
    currency: a.currency,
    notes: a.notes,
  }));
}

async function buildBusinessCashbookSnapshot(
  firmId: string,
  asOf?: Date,
): Promise<BusinessCashbookSnapshot> {
  const bookBalanceCents = await getBusinessCashbookBalance(firmId, {
    bankAccountLabel: DEFAULT_BUSINESS_BANK_LABEL,
    asOf,
  });

  const reconRows = await listReconciliationRuns(firmId, {
    reconType: "business_bank",
    status: "completed",
  });
  const lastRecon = reconRows.find(
    (r) => r.run.bankAccountLabel === DEFAULT_BUSINESS_BANK_LABEL,
  );

  let statementVsBookVarianceCents: number | null = null;
  if (lastRecon) {
    statementVsBookVarianceCents = bookBalanceCents - lastRecon.run.statementBalanceCents;
  }

  return {
    bankAccountLabel: DEFAULT_BUSINESS_BANK_LABEL,
    bookBalanceCents,
    lastRecon: lastRecon
      ? {
          id: lastRecon.run.id,
          periodYear: lastRecon.run.periodYear,
          periodMonth: lastRecon.run.periodMonth,
          statementBalanceCents: lastRecon.run.statementBalanceCents,
          ledgerBalanceCents: lastRecon.run.ledgerBalanceCents,
          varianceCents: lastRecon.run.varianceCents,
          status: lastRecon.run.status,
          completedAt: lastRecon.run.completedAt?.toISOString() ?? null,
        }
      : null,
    statementVsBookVarianceCents,
  };
}

export async function getWeeklyFinancePack(
  firmId: string,
  opts: {
    userId: string;
    viewAll: boolean;
    asOf?: Date;
    defaultCurrency?: string;
  },
): Promise<WeeklyFinancePack> {
  const asOf = opts.asOf ?? new Date();

  const debtors = await listDebtors(firmId, {
    userId: opts.userId,
    viewAll: opts.viewAll,
  });

  const outstandingInvoices: OutstandingInvoiceRow[] = debtors.rows.map((r) => ({
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceNumber,
    status: r.status,
    clientName: r.clientName,
    matterTitle: r.matterTitle,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    currency: r.currency,
    totalCents: r.totalCents,
    balanceCents: r.balanceCents,
  }));

  const trustSnapshot = await getTrustOverview(firmId);
  const businessCashbook = await buildBusinessCashbookSnapshot(firmId, asOf);

  return {
    pack: "weekly",
    asOf: asOf.toISOString(),
    debtors,
    outstandingInvoices,
    trustSnapshot,
    businessCashbook,
  };
}

export async function getMonthlyFinancePack(
  firmId: string,
  periodYear: number,
  periodMonth: number,
  opts?: { defaultCurrency?: string },
): Promise<MonthlyFinancePack> {
  const { from, to } = monthBoundsUtc(periodYear, periodMonth);
  const defaultCurrency = opts?.defaultCurrency ?? "USD";

  const allRecons = await listReconciliationRuns(firmId, {
    periodYear,
    periodMonth,
  });
  const businessBankRecons = allRecons
    .filter((r) => r.run.reconType === "business_bank")
    .map(serializeReconRun);
  const trustRecons = allRecons
    .filter((r) => r.run.reconType === "trust_bank" || r.run.reconType === "trust_vault")
    .map(serializeReconRun);

  const expenseRows = await listFirmExpenses(firmId, { from, to });
  const categoryTotals = new Map<string, { totalCents: number; count: number }>();
  let expenseTotalCents = 0;
  for (const row of expenseRows) {
    const amt = row.expense.amountCents;
    expenseTotalCents += amt;
    const cat = row.expense.category;
    const prev = categoryTotals.get(cat) ?? { totalCents: 0, count: 0 };
    categoryTotals.set(cat, {
      totalCents: prev.totalCents + amt,
      count: prev.count + 1,
    });
  }

  const expenses: MonthlyExpenseSummary = {
    totalCents: expenseTotalCents,
    currency: defaultCurrency,
    count: expenseRows.length,
    byCategory: Array.from(categoryTotals.entries())
      .map(([category, stats]) => ({
        category,
        label: EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? category,
        totalCents: stats.totalCents,
        count: stats.count,
      }))
      .sort((a, b) => b.totalCents - a.totalCents),
    items: expenseRows.map((row) => ({
      id: row.expense.id,
      expenseDate: row.expense.expenseDate.toISOString(),
      category: row.expense.category,
      categoryLabel:
        EXPENSE_CATEGORY_LABELS[row.expense.category as keyof typeof EXPENSE_CATEGORY_LABELS] ??
        row.expense.category,
      payee: row.expense.payee,
      amountCents: row.expense.amountCents,
      currency: row.expense.currency,
    })),
  };

  const feeIncomeByCurrency = await sumFeePaymentsInPeriod(firmId, from, to);
  const expenseByCurrency = new Map<string, number>();
  for (const row of expenseRows) {
    const c = row.expense.currency;
    expenseByCurrency.set(c, (expenseByCurrency.get(c) ?? 0) + row.expense.amountCents);
  }

  const currencySet = new Set<string>([
    ...feeIncomeByCurrency.map((r) => r.currency),
    ...expenseByCurrency.keys(),
    defaultCurrency,
  ]);

  const byCurrency = Array.from(currencySet).map((currency) => {
    const feeIncomeCents =
      feeIncomeByCurrency.find((r) => r.currency === currency)?.totalCents ?? 0;
    const expenseTotal = expenseByCurrency.get(currency) ?? 0;
    return {
      currency,
      feeIncomeCents,
      expenseTotalCents: expenseTotal,
      profitCents: feeIncomeCents - expenseTotal,
    };
  });

  const primaryFee = feeIncomeByCurrency.find((r) => r.currency === defaultCurrency);
  const primaryExpense = expenseByCurrency.get(defaultCurrency) ?? 0;
  const feeIncomeCents = primaryFee?.totalCents ?? 0;
  const feePaymentCount = primaryFee?.paymentCount ?? 0;

  const profitAndLoss: ProfitAndLoss = {
    incomeBasis: PL_INCOME_BASIS,
    note: PL_DEFINITION_NOTE,
    periodYear,
    periodMonth,
    currency: defaultCurrency,
    feeIncomeCents,
    feePaymentCount,
    expenseTotalCents: primaryExpense,
    expenseCount: expenseRows.filter((r) => r.expense.currency === defaultCurrency).length,
    profitCents: feeIncomeCents - primaryExpense,
    byCurrency,
  };

  const lockRow = await getPeriodLock(firmId, periodYear, periodMonth);
  const assets = await listFirmAssets(firmId);

  return {
    pack: "monthly",
    periodYear,
    periodMonth,
    businessBankRecons,
    trustRecons,
    expenses,
    profitAndLoss,
    periodLock: {
      locked: lockRow !== null,
      lockedAt: lockRow?.lock.lockedAt.toISOString() ?? null,
      lockedByName: lockRow?.lockedByName ?? null,
    },
    assets,
  };
}

export function weeklyPackToCsv(pack: WeeklyFinancePack): string {
  const sections: string[] = [];

  sections.push("WEEKLY FINANCE PACK");
  sections.push(`As of: ${pack.asOf}`);
  sections.push("");

  sections.push("DEBTORS / AGEING");
  sections.push(
    toCsv(
      ["Invoice", "Client", "Matter", "Due", "Balance cents", "Bucket"],
      pack.debtors.rows.map((r) => [
        r.invoiceNumber,
        r.clientName,
        r.matterTitle,
        r.dueDate ?? "",
        r.balanceCents,
        r.bucket,
      ]),
    ).trim(),
  );
  sections.push("");

  sections.push("TRUST SNAPSHOT");
  sections.push(
    toCsv(
      ["Account", "Kind", "Currency", "Balance cents"],
      pack.trustSnapshot.accounts.map((a) => [
        a.name,
        a.accountKind,
        a.currency,
        a.balanceCents,
      ]),
    ).trim(),
  );
  sections.push("");

  sections.push("BUSINESS CASHBOOK");
  sections.push(`Book balance cents: ${pack.businessCashbook.bookBalanceCents}`);
  if (pack.businessCashbook.lastRecon) {
    sections.push(
      `Last recon statement cents: ${pack.businessCashbook.lastRecon.statementBalanceCents}`,
    );
  }

  return `${sections.join("\n")}\n`;
}

export function monthlyPackToCsv(pack: MonthlyFinancePack): string {
  const sections: string[] = [];

  sections.push("MONTHLY FINANCE PACK");
  sections.push(`Period: ${pack.periodYear}-${String(pack.periodMonth).padStart(2, "0")}`);
  sections.push("");

  sections.push("PROFIT AND LOSS");
  sections.push(`Income basis: ${pack.profitAndLoss.incomeBasis}`);
  sections.push(`Fee income cents: ${pack.profitAndLoss.feeIncomeCents}`);
  sections.push(`Expenses cents: ${pack.profitAndLoss.expenseTotalCents}`);
  sections.push(`Profit cents: ${pack.profitAndLoss.profitCents}`);
  sections.push("");

  sections.push("EXPENSES");
  sections.push(
    toCsv(
      ["Date", "Category", "Payee", "Amount cents", "Currency"],
      pack.expenses.items.map((e) => [
        e.expenseDate.slice(0, 10),
        e.categoryLabel,
        e.payee,
        e.amountCents,
        e.currency,
      ]),
    ).trim(),
  );
  sections.push("");

  sections.push("TRUST RECONCILIATIONS");
  sections.push(
    toCsv(
      ["Type", "Account", "Status", "Variance cents"],
      pack.trustRecons.map((r) => [
        r.reconType,
        r.trustAccountName ?? "",
        r.status,
        r.varianceCents,
      ]),
    ).trim(),
  );
  sections.push("");

  sections.push("BUSINESS BANK RECONCILIATIONS");
  sections.push(
    toCsv(
      ["Bank label", "Status", "Variance cents"],
      pack.businessBankRecons.map((r) => [
        r.bankAccountLabel ?? "",
        r.status,
        r.varianceCents,
      ]),
    ).trim(),
  );

  if (pack.assets.length > 0) {
    sections.push("");
    sections.push("ASSET REGISTER");
    sections.push(
      toCsv(
        ["Description", "Acquired", "Cost cents", "Currency"],
        pack.assets.map((a) => [
          a.description,
          a.acquiredDate.slice(0, 10),
          a.costCents,
          a.currency,
        ]),
      ).trim(),
    );
  }

  return `${sections.join("\n")}\n`;
}
