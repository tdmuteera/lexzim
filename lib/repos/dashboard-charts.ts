/**
 * Dashboard chart / command-centre KPI helpers.
 */
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  clients,
  feePayments,
  invoices,
  matterTeam,
  matters,
} from "@/lib/db/schema";
import { OPEN_MATTER_STATUSES } from "@/lib/matters/validation";

function accessibleMatterIdsSubquery(firmId: string, userId: string) {
  const db = getDb();
  return db
    .select({ matterId: matterTeam.matterId })
    .from(matterTeam)
    .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, userId)));
}

function matterAccessCondition(
  firmId: string,
  userId: string,
  viewAll: boolean,
) {
  if (viewAll) return eq(matters.firmId, firmId);
  return and(
    eq(matters.firmId, firmId),
    or(
      eq(matters.responsibleLawyerId, userId),
      inArray(matters.id, accessibleMatterIdsSubquery(firmId, userId)),
    ),
  )!;
}

/** Matter status counts for dashboard doughnut. */
export async function getDashboardMatterStatusMix(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
}) {
  const db = getDb();
  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);
  const rows = await db
    .select({
      status: matters.status,
      count: sql<number>`count(*)::int`,
    })
    .from(matters)
    .where(matterAccess)
    .groupBy(matters.status);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = r.count;
    total += r.count;
  }
  return { byStatus, total };
}

/** Fee payments summed by calendar month for the last N months. */
export async function getDashboardFeeRevenueByMonth(
  firmId: string,
  months = 6,
) {
  const db = getDb();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const rows = await db
    .select({
      year: sql<number>`extract(year from ${feePayments.paidAt})::int`,
      month: sql<number>`extract(month from ${feePayments.paidAt})::int`,
      totalCents: sql<number>`coalesce(sum(${feePayments.amountCents}), 0)::int`,
      currency: feePayments.currency,
    })
    .from(feePayments)
    .where(and(eq(feePayments.firmId, firmId), gte(feePayments.paidAt, start)))
    .groupBy(
      sql`extract(year from ${feePayments.paidAt})`,
      sql`extract(month from ${feePayments.paidAt})`,
      feePayments.currency,
    );

  const series: Array<{
    key: string;
    label: string;
    totalCents: number;
    currency: string;
  }> = [];

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString(undefined, { month: "short" });
    const match = rows.find(
      (r) => r.year === d.getFullYear() && r.month === d.getMonth() + 1,
    );
    series.push({
      key,
      label,
      totalCents: match?.totalCents ?? 0,
      currency: match?.currency ?? "USD",
    });
  }
  return series;
}

/** Extra KPI numbers for command-centre dashboard. */
export async function getDashboardCommandKpis(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
}) {
  const db = getDb();
  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [clientCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(eq(clients.firmId, input.firmId));

  const [newClients] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(
      and(eq(clients.firmId, input.firmId), gte(clients.createdAt, monthStart)),
    );

  const [highPriority] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matters)
    .where(
      and(
        matterAccess,
        inArray(matters.status, [...OPEN_MATTER_STATUSES]),
        inArray(matters.priority, ["high", "urgent"]),
      ),
    );

  const hearingRows = await db
    .select({
      id: matters.id,
      nextHearingAt: matters.nextHearingAt,
    })
    .from(matters)
    .where(
      and(
        matterAccess,
        isNotNull(matters.nextHearingAt),
        gte(matters.nextHearingAt, now),
        lte(matters.nextHearingAt, weekEnd),
      ),
    )
    .orderBy(asc(matters.nextHearingAt))
    .limit(20);

  const outstandingRows = await db
    .select({
      totalCents: invoices.totalCents,
      currency: invoices.currency,
      paidCents: sql<number>`coalesce((
        select sum(${feePayments.amountCents}) from ${feePayments}
        where ${feePayments.firmId} = ${input.firmId}
          and ${feePayments.invoiceId} = ${invoices.id}
      ), 0)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.firmId, input.firmId),
        inArray(invoices.status, ["sent", "overdue", "draft"]),
      ),
    );

  let outstandingCents = 0;
  let currency = "USD";
  for (const r of outstandingRows) {
    const bal = Math.max(0, r.totalCents - (Number(r.paidCents) || 0));
    outstandingCents += bal;
    if (r.currency) currency = r.currency;
  }

  return {
    activeClients: clientCount?.count ?? 0,
    newClientsThisMonth: newClients?.count ?? 0,
    highPriorityOpen: highPriority?.count ?? 0,
    hearingsThisWeek: hearingRows.length,
    nextHearingAt: hearingRows[0]?.nextHearingAt?.toISOString() ?? null,
    outstandingFeesCents: outstandingCents,
    outstandingCurrency: currency,
  };
}
