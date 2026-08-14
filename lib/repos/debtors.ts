/**
 * Debtors desk queries (Phase 6 P6-05).
 * Outstanding fee invoices with due-date ageing buckets.
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import {
  AR_AGING_BUCKETS,
  agingBucketFromDueDate,
  daysBetween,
  type ArAgingBucket,
} from "@/lib/billing/aging";
import { clientDisplayLabel } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import {
  clients,
  feePayments,
  invoices,
  matters,
} from "@/lib/db/schema";
import { toCsv } from "@/lib/reports/csv";
import { listAccessibleMatterIds } from "@/lib/repos/matters";

export type DebtorsFilters = {
  matterId?: string;
  clientId?: string;
  bucket?: ArAgingBucket;
  from?: Date;
  to?: Date;
};

export type DebtorsRow = {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  clientId: string | null;
  clientName: string;
  matterId: string;
  matterTitle: string;
  matterNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  bucket: ArAgingBucket;
  daysPastDue: number;
};

export type DebtorsCurrencySummary = {
  currency: string;
  totalBalanceCents: number;
  invoiceCount: number;
  buckets: Array<{
    bucket: ArAgingBucket;
    count: number;
    balanceCents: number;
  }>;
};

export type DebtorsReport = {
  title: string;
  note: string;
  agingBasis: "due_date";
  asOf: string;
  summaryByCurrency: DebtorsCurrencySummary[];
  rows: DebtorsRow[];
};

export async function listDebtors(
  firmId: string,
  opts: {
    userId: string;
    viewAll: boolean;
    filters?: DebtorsFilters;
  },
): Promise<DebtorsReport> {
  const db = getDb();
  const now = new Date();
  const filters = opts.filters ?? {};

  const conditions = [
    eq(invoices.firmId, firmId),
    ne(invoices.status, "void"),
    ne(invoices.status, "draft"),
  ];
  if (filters.matterId) conditions.push(eq(invoices.matterId, filters.matterId));
  if (filters.clientId) conditions.push(eq(invoices.clientId, filters.clientId));
  if (filters.from) conditions.push(gte(invoices.issueDate, filters.from));
  if (filters.to) conditions.push(lte(invoices.issueDate, filters.to));

  const rawRows = await db
    .select({
      invoice: invoices,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      clientFullName: clients.fullName,
      clientFirstName: clients.firstName,
      clientSurname: clients.surname,
      clientLegalName: clients.legalName,
      clientRegisteredName: clients.registeredName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      paidCents: sql<number>`coalesce((
        select sum(${feePayments.amountCents}) from ${feePayments}
        where ${feePayments.firmId} = ${firmId}
          and ${feePayments.invoiceId} = ${invoices.id}
      ), 0)::int`,
    })
    .from(invoices)
    .innerJoin(matters, and(eq(matters.id, invoices.matterId), eq(matters.firmId, firmId)))
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.firmId, firmId)))
    .where(and(...conditions))
    .orderBy(asc(invoices.dueDate), desc(invoices.issueDate));

  let accessible: Set<string> | null = null;
  if (!opts.viewAll) {
    accessible = new Set(await listAccessibleMatterIds(firmId, opts.userId));
  }

  const rows: DebtorsRow[] = [];

  for (const r of rawRows) {
    if (accessible && !accessible.has(r.invoice.matterId)) continue;

    const paidCents = Number(r.paidCents) || 0;
    const balanceCents = Math.max(0, r.invoice.totalCents - paidCents);
    if (balanceCents <= 0) continue;

    const bucket = agingBucketFromDueDate(r.invoice.dueDate, now);
    if (filters.bucket && bucket !== filters.bucket) continue;

    const clientName = r.clientType
      ? clientDisplayLabel({
          clientNumber: r.clientNumber,
          clientType: r.clientType,
          fullName: r.clientFullName,
          firstName: r.clientFirstName,
          surname: r.clientSurname,
          legalName: r.clientLegalName,
          registeredName: r.clientRegisteredName,
          tradingName: r.clientTradingName,
        })
      : "n/a";

    rows.push({
      invoiceId: r.invoice.id,
      invoiceNumber: r.invoice.invoiceNumber,
      status: r.invoice.status,
      clientId: r.invoice.clientId,
      clientName,
      matterId: r.invoice.matterId,
      matterTitle: r.matterTitle,
      matterNumber: r.matterNumber,
      issueDate: r.invoice.issueDate?.toISOString().slice(0, 10) ?? null,
      dueDate: r.invoice.dueDate?.toISOString().slice(0, 10) ?? null,
      currency: r.invoice.currency,
      totalCents: r.invoice.totalCents,
      paidCents,
      balanceCents,
      bucket,
      daysPastDue:
        r.invoice.dueDate && r.invoice.dueDate.getTime() < now.getTime()
          ? daysBetween(r.invoice.dueDate, now)
          : 0,
    });
  }

  const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  const summaryByCurrency: DebtorsCurrencySummary[] = currencies.map((currency) => {
    const currencyRows = rows.filter((row) => row.currency === currency);
    const buckets = AR_AGING_BUCKETS.map((bucket) => ({
      bucket,
      count: currencyRows.filter((row) => row.bucket === bucket).length,
      balanceCents: currencyRows
        .filter((row) => row.bucket === bucket)
        .reduce((sum, row) => sum + row.balanceCents, 0),
    }));
    return {
      currency,
      totalBalanceCents: currencyRows.reduce((sum, row) => sum + row.balanceCents, 0),
      invoiceCount: currencyRows.length,
      buckets,
    };
  });

  return {
    title: "Debtors (outstanding fee invoices)",
    note: "Fee side only. Ageing from due date. Does not include trust balances.",
    agingBasis: "due_date",
    asOf: now.toISOString(),
    summaryByCurrency,
    rows,
  };
}

export function debtorsToCsv(report: DebtorsReport): string {
  return toCsv(
    [
      "invoiceNumber",
      "status",
      "clientName",
      "matterNumber",
      "matterTitle",
      "issueDate",
      "dueDate",
      "bucket",
      "daysPastDue",
      "currency",
      "totalCents",
      "paidCents",
      "balanceCents",
    ],
    report.rows.map((r) => [
      r.invoiceNumber,
      r.status,
      r.clientName,
      r.matterNumber,
      r.matterTitle,
      r.issueDate,
      r.dueDate,
      r.bucket,
      r.daysPastDue,
      r.currency,
      r.totalCents,
      r.paidCents,
      r.balanceCents,
    ]),
  );
}
