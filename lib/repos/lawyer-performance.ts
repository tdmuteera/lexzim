/**
 * Lawyer caseload and collected-fee revenue (P7-10).
 * Attribution: cash collected on fee_payments, rolled to the invoice matter's
 * current responsible_lawyer_id. Not billed (invoice issue date) and not GL accrual.
 */
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feePayments, invoices, matters, users } from "@/lib/db/schema";
import { buildProfitAndLoss } from "@/lib/gl/statements";
import { OPEN_MATTER_STATUSES } from "@/lib/matters/validation";

export const LAWYER_REVENUE_POLICY =
  "Cash collected: fee receipts (fee_payments.paid_at) in the period, attributed to the invoice matter's current responsible lawyer. Not billed-on-issue and not timekeeper on the invoice line.";

export type LawyerPerformanceRow = {
  lawyerId: string | null;
  lawyerName: string;
  openMatters: number;
  collectedCents: number;
};

export type LawyerPerformanceGlCheck = {
  feePaymentsTotalCents: number;
  glRevenueCents: number;
  varianceCents: number;
  mismatch: boolean;
  note: string;
};

export type LawyerPerformanceReport = {
  title: string;
  from: string;
  to: string;
  currency: string;
  viewAll: boolean;
  attributionPolicy: string;
  rows: LawyerPerformanceRow[];
  totals: { openMatters: number; collectedCents: number };
  glCheck: LawyerPerformanceGlCheck | null;
};

export async function listCaseloadByLawyer(
  firmId: string,
  opts?: { lawyerId?: string },
) {
  const db = getDb();
  const conditions = [
    eq(matters.firmId, firmId),
    inArray(matters.status, [...OPEN_MATTER_STATUSES]),
  ];
  if (opts?.lawyerId) {
    conditions.push(eq(matters.responsibleLawyerId, opts.lawyerId));
  }

  const rows = await db
    .select({
      lawyerId: matters.responsibleLawyerId,
      lawyerName: users.fullName,
      openCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(matters)
    .leftJoin(users, eq(users.id, matters.responsibleLawyerId))
    .where(and(...conditions))
    .groupBy(matters.responsibleLawyerId, users.fullName)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => ({
    lawyerId: row.lawyerId,
    lawyerName: row.lawyerName ?? "Unassigned",
    openMatters: row.openCount,
  }));
}

export async function listRevenueByLawyer(
  firmId: string,
  from: Date,
  to: Date,
  opts?: { lawyerId?: string },
) {
  const db = getDb();
  const conditions = [
    eq(feePayments.firmId, firmId),
    gte(feePayments.paidAt, from),
    lte(feePayments.paidAt, to),
  ];
  if (opts?.lawyerId) {
    conditions.push(eq(matters.responsibleLawyerId, opts.lawyerId));
  }

  const rows = await db
    .select({
      lawyerId: matters.responsibleLawyerId,
      lawyerName: users.fullName,
      collectedCents: sql<number>`coalesce(sum(${feePayments.amountCents}), 0)::int`.mapWith(
        Number,
      ),
    })
    .from(feePayments)
    .innerJoin(
      invoices,
      and(eq(invoices.id, feePayments.invoiceId), eq(invoices.firmId, firmId)),
    )
    .innerJoin(matters, and(eq(matters.id, invoices.matterId), eq(matters.firmId, firmId)))
    .leftJoin(users, eq(users.id, matters.responsibleLawyerId))
    .where(and(...conditions))
    .groupBy(matters.responsibleLawyerId, users.fullName)
    .orderBy(desc(sql`coalesce(sum(${feePayments.amountCents}), 0)`));

  return rows.map((row) => ({
    lawyerId: row.lawyerId,
    lawyerName: row.lawyerName ?? "Unassigned",
    collectedCents: row.collectedCents,
  }));
}

function lawyerKey(id: string | null): string {
  return id ?? "unassigned";
}

export async function buildLawyerPerformance(input: {
  firmId: string;
  from: Date;
  to: Date;
  currency: string;
  viewAll: boolean;
  lawyerId: string;
  includeGlCheck?: boolean;
}): Promise<LawyerPerformanceReport> {
  const scope = input.viewAll ? undefined : { lawyerId: input.lawyerId };

  const [caseload, revenue] = await Promise.all([
    listCaseloadByLawyer(input.firmId, scope),
    listRevenueByLawyer(input.firmId, input.from, input.to, scope),
  ]);

  const map = new Map<string, LawyerPerformanceRow>();
  for (const row of caseload) {
    map.set(lawyerKey(row.lawyerId), {
      lawyerId: row.lawyerId,
      lawyerName: row.lawyerName,
      openMatters: row.openMatters,
      collectedCents: 0,
    });
  }
  for (const row of revenue) {
    const existing = map.get(lawyerKey(row.lawyerId));
    if (existing) {
      existing.collectedCents = row.collectedCents;
    } else {
      map.set(lawyerKey(row.lawyerId), {
        lawyerId: row.lawyerId,
        lawyerName: row.lawyerName,
        openMatters: 0,
        collectedCents: row.collectedCents,
      });
    }
  }

  const rows = [...map.values()].sort((a, b) => {
    if (b.collectedCents !== a.collectedCents) return b.collectedCents - a.collectedCents;
    return b.openMatters - a.openMatters;
  });

  const totals = {
    openMatters: rows.reduce((s, r) => s + r.openMatters, 0),
    collectedCents: rows.reduce((s, r) => s + r.collectedCents, 0),
  };

  let glCheck: LawyerPerformanceGlCheck | null = null;
  if (input.includeGlCheck && input.viewAll) {
    try {
      const pl = await buildProfitAndLoss(input.firmId, input.from, input.to, input.currency);
      const glRevenueCents = pl.revenue.subtotalCents;
      const varianceCents = totals.collectedCents - glRevenueCents;
      glCheck = {
        feePaymentsTotalCents: totals.collectedCents,
        glRevenueCents,
        varianceCents,
        mismatch: varianceCents !== 0,
        note:
          "GL revenue (4000 accounts) is recognized when invoices are sent. Lawyer totals are cash collected in the same window. A difference is expected when invoices are unpaid or paid in a different period than billed.",
      };
    } catch {
      glCheck = null;
    }
  }

  return {
    title: "Lawyer performance",
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    currency: input.currency,
    viewAll: input.viewAll,
    attributionPolicy: LAWYER_REVENUE_POLICY,
    rows,
    totals,
    glCheck,
  };
}

export function defaultLawyerPerformanceRange(now = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(to.getFullYear(), 0, 1, 0, 0, 0, 0);
  return { from, to };
}

export function lastMonthsRange(months: number, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setMonth(from.getMonth() - months);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}
