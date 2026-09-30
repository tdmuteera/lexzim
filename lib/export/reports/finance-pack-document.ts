import "server-only";

import { agingBucketDisplay } from "@/lib/billing/aging";
import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import {
  getMonthlyFinancePack,
  getWeeklyFinancePack,
  monthlyPackToCsv,
  weeklyPackToCsv,
  type MonthlyFinancePack,
  type WeeklyFinancePack,
} from "@/lib/repos/finance-reports";

function shortDate(value: string | null | undefined): string {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function weeklyPackToExportDocument(pack: WeeklyFinancePack): ExportDocument {
  const cash = pack.businessCashbook;
  const currency =
    pack.outstandingInvoices[0]?.currency ??
    pack.debtors.summaryByCurrency[0]?.currency ??
    "USD";

  return {
    title: "Weekly finance pack",
    subtitle: `Collections, trust, and firm cash as of ${shortDate(pack.asOf)}`,
    asOf: shortDate(pack.asOf),
    summaryLines: [
      ...pack.debtors.summaryByCurrency.map(
        (s) =>
          `Debtors ${s.currency}: ${s.invoiceCount} invoice(s), ${centsToDisplay(s.totalBalanceCents, s.currency)}`,
      ),
      `Trust accounts: ${pack.trustSnapshot.accounts.length}`,
      ...pack.firmCash.map((p) => `${p.label}: ${centsToDisplay(p.balanceCents, currency)}`),
      `Bank register (memo) balance: ${centsToDisplay(cash.bookBalanceCents, currency)}`,
      cash.lastRecon
        ? `Last recon variance: ${centsToDisplay(cash.lastRecon.varianceCents, currency)}`
        : "No completed business bank recon yet.",
    ],
    columns: [
      { key: "invoiceNumber", header: "Invoice" },
      { key: "clientName", header: "Client" },
      { key: "matter", header: "Matter" },
      { key: "dueDate", header: "Due" },
      { key: "bucket", header: "Bucket" },
      { key: "balance", header: "Balance", align: "right" },
    ],
    rows: pack.debtors.rows.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      clientName: r.clientName,
      matter: r.matterTitle,
      dueDate: r.dueDate ?? "n/a",
      bucket: agingBucketDisplay(r.bucket),
      balance: centsToDisplay(r.balanceCents, r.currency),
    })),
  };
}

export function monthlyPackToExportDocument(pack: MonthlyFinancePack): ExportDocument {
  const pl = pack.profitAndLoss;
  const monthLabel = new Date(pack.periodYear, pack.periodMonth - 1, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  return {
    title: "Monthly finance pack",
    subtitle: monthLabel,
    note: pl.note,
    asOf: monthLabel,
    summaryLines: [
      `Fee income (${pl.incomeBasis}): ${centsToDisplay(pl.feeIncomeCents, pl.currency)}`,
      `Expenses: ${centsToDisplay(pl.expenseTotalCents, pl.currency)}`,
      `Profit: ${centsToDisplay(pl.profitCents, pl.currency)}`,
      pack.periodLock.locked
        ? `Period locked${pack.periodLock.lockedByName ? ` by ${pack.periodLock.lockedByName}` : ""}`
        : "Period is open",
    ],
    columns: [
      { key: "date", header: "Date" },
      { key: "category", header: "Category" },
      { key: "payee", header: "Payee" },
      { key: "amount", header: "Amount", align: "right" },
    ],
    rows: pack.expenses.items.map((e) => ({
      date: e.expenseDate.slice(0, 10),
      category: e.categoryLabel,
      payee: e.payee,
      amount: centsToDisplay(e.amountCents, e.currency),
    })),
  };
}

export async function weeklyFinanceExportDocument(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  asOf?: Date;
  defaultCurrency: string;
}): Promise<ExportDocument> {
  const pack = await getWeeklyFinancePack(input.firmId, {
    userId: input.userId,
    viewAll: input.viewAll,
    asOf: input.asOf,
    defaultCurrency: input.defaultCurrency,
  });
  return weeklyPackToExportDocument(pack);
}

export async function monthlyFinanceExportDocument(input: {
  firmId: string;
  year: number;
  month: number;
  defaultCurrency: string;
}): Promise<ExportDocument> {
  const pack = await getMonthlyFinancePack(input.firmId, input.year, input.month, {
    defaultCurrency: input.defaultCurrency,
  });
  return monthlyPackToExportDocument(pack);
}

export async function weeklyFinanceToCsv(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  asOf?: Date;
  defaultCurrency: string;
}): Promise<string> {
  const pack = await getWeeklyFinancePack(input.firmId, {
    userId: input.userId,
    viewAll: input.viewAll,
    asOf: input.asOf,
    defaultCurrency: input.defaultCurrency,
  });
  return weeklyPackToCsv(pack);
}

export async function monthlyFinanceToCsv(input: {
  firmId: string;
  year: number;
  month: number;
  defaultCurrency: string;
}): Promise<string> {
  const pack = await getMonthlyFinancePack(input.firmId, input.year, input.month, {
    defaultCurrency: input.defaultCurrency,
  });
  return monthlyPackToCsv(pack);
}
