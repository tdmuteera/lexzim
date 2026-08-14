import "server-only";

import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { glAccounts, glJournalEntries, glJournalLines } from "@/lib/db/schema";
import { ensureCoaSeeded } from "@/lib/gl/accounts";
import type {
  BalanceSheetReport,
  GlAccountType,
  ProfitAndLossReport,
  TrialBalanceReport,
} from "@/lib/gl/types";

type AccountBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: GlAccountType;
  normalBalance: string;
  debitTotal: number;
  creditTotal: number;
};

async function loadAccountBalances(
  firmId: string,
  opts: { asOf?: Date; from?: Date; to?: Date },
): Promise<AccountBalanceRow[]> {
  await ensureCoaSeeded(firmId);
  const db = getDb();

  const accounts = await db
    .select({
      accountId: glAccounts.id,
      code: glAccounts.code,
      name: glAccounts.name,
      type: glAccounts.type,
      normalBalance: glAccounts.normalBalance,
    })
    .from(glAccounts)
    .where(eq(glAccounts.firmId, firmId))
    .orderBy(asc(glAccounts.code));

  const dateConditions = [eq(glJournalLines.firmId, firmId)];
  if (opts.asOf) dateConditions.push(lte(glJournalEntries.entryDate, opts.asOf));
  if (opts.from) dateConditions.push(gte(glJournalEntries.entryDate, opts.from));
  if (opts.to) dateConditions.push(lte(glJournalEntries.entryDate, opts.to));

  const totals = await db
    .select({
      accountId: glJournalLines.accountId,
      debitTotal: sql<number>`coalesce(sum(${glJournalLines.debitCents}), 0)`.mapWith(Number),
      creditTotal: sql<number>`coalesce(sum(${glJournalLines.creditCents}), 0)`.mapWith(Number),
    })
    .from(glJournalLines)
    .innerJoin(glJournalEntries, eq(glJournalEntries.id, glJournalLines.entryId))
    .where(and(...dateConditions))
    .groupBy(glJournalLines.accountId);

  const totalsByAccount = new Map(
    totals.map((r) => [r.accountId, { debitTotal: r.debitTotal, creditTotal: r.creditTotal }]),
  );

  return accounts.map((a) => {
    const t = totalsByAccount.get(a.accountId) ?? { debitTotal: 0, creditTotal: 0 };
    return {
      accountId: a.accountId,
      code: a.code,
      name: a.name,
      type: a.type as GlAccountType,
      normalBalance: a.normalBalance,
      debitTotal: t.debitTotal,
      creditTotal: t.creditTotal,
    };
  });
}

function signedBalance(row: AccountBalanceRow): number {
  if (row.normalBalance === "credit") {
    return row.creditTotal - row.debitTotal;
  }
  return row.debitTotal - row.creditTotal;
}

function trialBalanceColumns(row: AccountBalanceRow): { debitCents: number; creditCents: number } {
  const balance = signedBalance(row);
  if (balance === 0) return { debitCents: 0, creditCents: 0 };
  if (balance > 0) {
    return row.normalBalance === "debit"
      ? { debitCents: balance, creditCents: 0 }
      : { debitCents: 0, creditCents: balance };
  }
  const abs = Math.abs(balance);
  return row.normalBalance === "debit"
    ? { debitCents: 0, creditCents: abs }
    : { debitCents: abs, creditCents: 0 };
}

export async function buildTrialBalance(
  firmId: string,
  asOf: Date,
  currency = "USD",
): Promise<TrialBalanceReport> {
  const balances = await loadAccountBalances(firmId, { asOf });
  const rows = balances
    .map((b) => {
      const cols = trialBalanceColumns(b);
      return {
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        type: b.type,
        debitCents: cols.debitCents,
        creditCents: cols.creditCents,
      };
    })
    .filter((r) => r.debitCents !== 0 || r.creditCents !== 0);

  return {
    title: "Trial Balance",
    asOf: asOf.toISOString(),
    currency,
    rows,
    totalDebitCents: rows.reduce((s, r) => s + r.debitCents, 0),
    totalCreditCents: rows.reduce((s, r) => s + r.creditCents, 0),
  };
}

export async function buildProfitAndLoss(
  firmId: string,
  from: Date,
  to: Date,
  currency = "USD",
): Promise<ProfitAndLossReport> {
  const balances = await loadAccountBalances(firmId, { from, to });

  const revenueRows = balances
    .filter((b) => b.type === "revenue")
    .map((b) => ({ code: b.code, name: b.name, amountCents: signedBalance(b) }))
    .filter((r) => r.amountCents !== 0);

  const directRows = balances
    .filter((b) => b.type === "direct_cost")
    .map((b) => ({ code: b.code, name: b.name, amountCents: signedBalance(b) }))
    .filter((r) => r.amountCents !== 0);

  const expenseRows = balances
    .filter((b) => b.type === "expense")
    .map((b) => ({ code: b.code, name: b.name, amountCents: signedBalance(b) }))
    .filter((r) => r.amountCents !== 0);

  const revenueTotal = revenueRows.reduce((s, r) => s + r.amountCents, 0);
  const directTotal = directRows.reduce((s, r) => s + r.amountCents, 0);
  const expenseTotal = expenseRows.reduce((s, r) => s + r.amountCents, 0);

  return {
    title: "Profit and Loss",
    from: from.toISOString(),
    to: to.toISOString(),
    currency,
    revenue: { label: "Revenue", rows: revenueRows, subtotalCents: revenueTotal },
    directCosts: { label: "Direct client costs", rows: directRows, subtotalCents: directTotal },
    grossProfitCents: revenueTotal - directTotal,
    operatingExpenses: {
      label: "Operating expenses",
      rows: expenseRows,
      subtotalCents: expenseTotal,
    },
    netProfitCents: revenueTotal - directTotal - expenseTotal,
  };
}

export async function buildBalanceSheet(
  firmId: string,
  asOf: Date,
  currency = "USD",
): Promise<BalanceSheetReport> {
  const balances = await loadAccountBalances(firmId, { asOf });
  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const pl = await buildProfitAndLoss(firmId, yearStart, asOf, currency);

  const assetRows = balances
    .filter((b) => b.type === "asset")
    .map((b) => ({ code: b.code, name: b.name, balanceCents: signedBalance(b) }))
    .filter((r) => r.balanceCents !== 0);

  const liabilityRows = balances
    .filter((b) => b.type === "liability")
    .map((b) => ({ code: b.code, name: b.name, balanceCents: signedBalance(b) }))
    .filter((r) => r.balanceCents !== 0);

  const equityRows = balances
    .filter((b) => b.type === "equity")
    .map((b) => ({ code: b.code, name: b.name, balanceCents: signedBalance(b) }))
    .filter((r) => r.balanceCents !== 0);

  const assetsTotal = assetRows.reduce((s, r) => s + r.balanceCents, 0);
  const liabilitiesTotal = liabilityRows.reduce((s, r) => s + r.balanceCents, 0);
  const equityTotal = equityRows.reduce((s, r) => s + r.balanceCents, 0);

  return {
    title: "Balance Sheet",
    asOf: asOf.toISOString(),
    currency,
    assets: { label: "Assets", rows: assetRows, subtotalCents: assetsTotal },
    liabilities: { label: "Liabilities", rows: liabilityRows, subtotalCents: liabilitiesTotal },
    equity: { label: "Equity", rows: equityRows, subtotalCents: equityTotal },
    currentYearEarningsCents: pl.netProfitCents,
    totalLiabilitiesAndEquityCents: liabilitiesTotal + equityTotal + pl.netProfitCents,
  };
}
