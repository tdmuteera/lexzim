/**
 * Dashboard aggregates (P1-10). Always firm-scoped; apply viewAll for matter visibility.
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { invoiceDetailPath } from "@/lib/billing/paths";
import { getDb } from "@/lib/db";
import { listCaseloadByLawyer } from "@/lib/repos/lawyer-performance";
import {
  calendarEvents,
  clients,
  feePayments,
  invoices,
  matterEvents,
  matterTeam,
  matters,
  pendingProcedures,
  trustAccounts,
  trustLedgerEntries,
  users,
} from "@/lib/db/schema";
import { clientDisplayName } from "@/lib/clients/display";
import {
  CLOSED_MATTER_STATUSES,
  OPEN_MATTER_STATUSES,
} from "@/lib/matters/validation";
import { serializeProcedure } from "@/lib/procedures/serialize";

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

export async function getDashboardStats(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  /** When false, new-clients count is limited to allocated clients. */
  clientViewAll?: boolean;
}) {
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const clientViewAll = input.clientViewAll ?? input.viewAll;

  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);

  const openRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matters)
    .where(and(matterAccess, inArray(matters.status, [...OPEN_MATTER_STATUSES])));

  const closedRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matters)
    .where(and(matterAccess, inArray(matters.status, [...CLOSED_MATTER_STATUSES])));

  let clientIds: string[] | null = null;
  if (!clientViewAll) {
    const { listAccessibleClientIds } = await import("@/lib/repos/clients");
    clientIds = await listAccessibleClientIds(input.firmId, input.userId);
  }

  const newClientsRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(
      and(
        eq(clients.firmId, input.firmId),
        gte(clients.createdAt, monthStart),
        clientIds
          ? inArray(
              clients.id,
              clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"],
            )
          : undefined,
      ),
    );

  const overdueProcConditions = [
    eq(pendingProcedures.firmId, input.firmId),
    eq(pendingProcedures.status, "todo"),
    isNotNull(pendingProcedures.dueAt),
    lt(pendingProcedures.dueAt, now),
  ];
  if (!input.viewAll) {
    overdueProcConditions.push(eq(pendingProcedures.assignedTo, input.userId));
  }
  const overdueRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingProcedures)
    .where(and(...overdueProcConditions));

  return {
    openMatters: openRows[0]?.count ?? 0,
    closedMatters: closedRows[0]?.count ?? 0,
    newClientsThisMonth: newClientsRows[0]?.count ?? 0,
    overdueProcedures: overdueRows[0]?.count ?? 0,
  };
}

export async function listDashboardProcedures(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  mode: "overdue" | "due_soon";
  limit?: number;
}) {
  const db = getDb();
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const conditions = [
    eq(pendingProcedures.firmId, input.firmId),
    eq(pendingProcedures.status, "todo"),
    isNotNull(pendingProcedures.dueAt),
  ];

  if (!input.viewAll) {
    conditions.push(eq(pendingProcedures.assignedTo, input.userId));
  }

  if (input.mode === "overdue") {
    conditions.push(lt(pendingProcedures.dueAt, now));
  } else {
    conditions.push(gte(pendingProcedures.dueAt, now));
    conditions.push(lte(pendingProcedures.dueAt, in7));
  }

  const rows = await db
    .select({
      procedure: pendingProcedures,
      assigneeName: users.fullName,
      matterTitle: matters.title,
    })
    .from(pendingProcedures)
    .innerJoin(
      matters,
      and(eq(matters.id, pendingProcedures.matterId), eq(matters.firmId, input.firmId)),
    )
    .leftJoin(users, eq(users.id, pendingProcedures.assignedTo))
    .where(and(...conditions))
    .orderBy(asc(pendingProcedures.dueAt))
    .limit(input.limit ?? 10);

  return rows.map((row) =>
    serializeProcedure(
      { ...row.procedure },
      { assigneeName: row.assigneeName ?? null, matterTitle: row.matterTitle },
    ),
  );
}

export async function listUpcomingHearings(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  limit?: number;
}) {
  const db = getDb();
  const now = new Date();
  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);

  const rows = await db
    .select({
      id: matters.id,
      title: matters.title,
      nextHearingAt: matters.nextHearingAt,
      courtName: matters.courtName,
      caseNumber: matters.caseNumber,
      status: matters.status,
      responsibleLawyerName: users.fullName,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(matters)
    .innerJoin(clients, and(eq(clients.id, matters.clientId), eq(clients.firmId, input.firmId)))
    .leftJoin(users, eq(users.id, matters.responsibleLawyerId))
    .where(
      and(
        matterAccess,
        isNotNull(matters.nextHearingAt),
        gte(matters.nextHearingAt, now),
      ),
    )
    .orderBy(asc(matters.nextHearingAt))
    .limit(input.limit ?? 10);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    nextHearingAt: row.nextHearingAt!.toISOString(),
    courtName: row.courtName,
    caseNumber: row.caseNumber,
    status: row.status,
    responsibleLawyerName: row.responsibleLawyerName ?? null,
    clientDisplayName:
      row.clientType === "company"
        ? row.clientTradingName || row.clientLegalName || "Unnamed company"
        : row.clientFullName || "Unnamed client",
  }));
}

export async function listUpcomingMeetings(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  limit?: number;
}) {
  const db = getDb();
  const now = new Date();
  const teamMatterIds = accessibleMatterIdsSubquery(input.firmId, input.userId);

  const rows = await db
    .select({
      event: calendarEvents,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, input.firmId)),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, calendarEvents.clientId), eq(clients.firmId, input.firmId)),
    )
    .where(
      and(
        eq(calendarEvents.firmId, input.firmId),
        eq(calendarEvents.eventType, "appointment"),
        gte(calendarEvents.startsAt, now),
        input.viewAll
          ? undefined
          : or(
              isNull(calendarEvents.matterId),
              inArray(
                calendarEvents.matterId,
                db
                  .select({ id: matters.id })
                  .from(matters)
                  .where(
                    and(
                      eq(matters.firmId, input.firmId),
                      or(
                        eq(matters.responsibleLawyerId, input.userId),
                        inArray(matters.id, teamMatterIds),
                      ),
                    ),
                  ),
              ),
            ),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .limit(input.limit ?? 5);

  return rows.map((row) => ({
    id: row.event.id,
    title: row.event.title,
    startsAt: row.event.startsAt.toISOString(),
    location: row.event.location,
    clientDisplayName: row.clientType
      ? clientDisplayName({
          clientType: row.clientType,
          fullName: row.clientFullName,
          legalName: row.clientLegalName,
          tradingName: row.clientTradingName,
        })
      : null,
    clientNumber: row.clientNumber,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    matterId: row.event.matterId,
    clientId: row.event.clientId,
    href: row.event.matterId
      ? `/matters/${row.event.matterId}`
      : row.event.clientId
        ? `/clients/${row.event.clientId}`
        : "/calendar",
  }));
}

export async function listRecentActivity(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  limit?: number;
}) {
  const db = getDb();
  const matterAccess = matterAccessCondition(input.firmId, input.userId, input.viewAll);

  const rows = await db
    .select({
      id: matterEvents.id,
      matterId: matterEvents.matterId,
      eventType: matterEvents.eventType,
      title: matterEvents.title,
      body: matterEvents.body,
      eventAt: matterEvents.eventAt,
      matterTitle: matters.title,
      createdByName: users.fullName,
    })
    .from(matterEvents)
    .innerJoin(matters, and(eq(matters.id, matterEvents.matterId), matterAccess))
    .leftJoin(users, eq(users.id, matterEvents.createdBy))
    .where(eq(matterEvents.firmId, input.firmId))
    .orderBy(desc(matterEvents.eventAt))
    .limit(input.limit ?? 12);

  return rows.map((row) => ({
    id: row.id,
    matterId: row.matterId,
    matterTitle: row.matterTitle,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    eventAt: row.eventAt.toISOString(),
    createdByName: row.createdByName ?? null,
  }));
}

/** Managing Partner workload: open matters per responsible lawyer. */
export async function listWorkloadByLawyer(firmId: string, opts?: { lawyerId?: string }) {
  return listCaseloadByLawyer(firmId, opts);
}

/** Fee invoices with outstanding balance past due (billing.view only on call site). */
export async function listDashboardOverdueInvoices(
  firmId: string,
  opts?: { limit?: number },
) {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      invoice: invoices,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
      paidCents: sql<number>`coalesce((
        select sum(${feePayments.amountCents}) from ${feePayments}
        where ${feePayments.firmId} = ${firmId}
          and ${feePayments.invoiceId} = ${invoices.id}
      ), 0)::int`,
    })
    .from(invoices)
    .innerJoin(matters, and(eq(matters.id, invoices.matterId), eq(matters.firmId, firmId)))
    .innerJoin(
      clients,
      and(
        eq(clients.id, invoices.clientId),
        eq(clients.firmId, firmId),
        isNull(clients.archivedAt),
      ),
    )
    .where(
      and(
        eq(invoices.firmId, firmId),
        inArray(invoices.status, ["sent", "overdue"]),
        isNotNull(invoices.dueDate),
        lt(invoices.dueDate, now),
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit((opts?.limit ?? 8) * 3);

  return rows
    .map((r) => {
      const paidCents = Number(r.paidCents) || 0;
      const balanceCents = Math.max(0, r.invoice.totalCents - paidCents);
      if (balanceCents <= 0) return null;
      return {
        id: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber,
        status: r.invoice.status,
        dueDate: r.invoice.dueDate!.toISOString().slice(0, 10),
        currency: r.invoice.currency,
        balanceCents,
        matterId: r.invoice.matterId,
        matterTitle: r.matterTitle,
        matterNumber: r.matterNumber,
        clientName: r.clientType
          ? r.clientType === "company"
            ? r.clientTradingName || r.clientLegalName || "Unnamed company"
            : r.clientFullName || "Unnamed client"
          : "n/a",
        href: invoiceDetailPath(r.invoice.id),
      };
    })
    .filter(Boolean)
    .slice(0, opts?.limit ?? 8) as Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    dueDate: string;
    currency: string;
    balanceCents: number;
    matterId: string;
    matterTitle: string;
    matterNumber: string | null;
    clientName: string;
    href: string;
  }>;
}

/** Trust attention: account balances + client balances needing review (trust.view only). */
export async function listDashboardTrustAttention(firmId: string) {
  const db = getDb();
  const accounts = await db
    .select({
      id: trustAccounts.id,
      name: trustAccounts.name,
      currency: trustAccounts.currency,
      isActive: trustAccounts.isActive,
      balanceCents: sql<number>`coalesce((
        select sum(${trustLedgerEntries.amountCents}) from ${trustLedgerEntries}
        where ${trustLedgerEntries.firmId} = ${firmId}
          and ${trustLedgerEntries.trustAccountId} = ${trustAccounts.id}
      ), 0)::int`,
    })
    .from(trustAccounts)
    .where(eq(trustAccounts.firmId, firmId))
    .orderBy(asc(trustAccounts.name));

  const clientBalances = await db
    .select({
      clientId: trustLedgerEntries.clientId,
      currency: trustLedgerEntries.currency,
      balanceCents: sql<number>`coalesce(sum(${trustLedgerEntries.amountCents}), 0)::int`,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(trustLedgerEntries)
    .innerJoin(
      clients,
      and(eq(clients.id, trustLedgerEntries.clientId), eq(clients.firmId, firmId)),
    )
    .where(
      and(eq(trustLedgerEntries.firmId, firmId), isNotNull(trustLedgerEntries.clientId)),
    )
    .groupBy(
      trustLedgerEntries.clientId,
      trustLedgerEntries.currency,
      clients.fullName,
      clients.legalName,
      clients.tradingName,
      clients.clientType,
    )
    .orderBy(desc(sql`abs(sum(${trustLedgerEntries.amountCents}))`))
    .limit(8);

  const accountRows = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    isActive: a.isActive,
    balanceCents: Number(a.balanceCents) || 0,
    flag:
      !a.isActive && (Number(a.balanceCents) || 0) !== 0
        ? "inactive_with_balance"
        : (Number(a.balanceCents) || 0) < 0
          ? "negative"
          : null,
  }));

  const clientRows = clientBalances.map((c) => {
    const balanceCents = Number(c.balanceCents) || 0;
    return {
      clientId: c.clientId!,
      clientName:
        c.clientType === "company"
          ? c.clientTradingName || c.clientLegalName || "Unnamed company"
          : c.clientFullName || "Unnamed client",
      currency: c.currency,
      balanceCents,
      flag: balanceCents < 0 ? "negative" : balanceCents === 0 ? null : "held",
      href: `/trust`,
    };
  });

  return {
    note: "Trust money only. Fee invoice AR is under Billing.",
    accounts: accountRows,
    clients: clientRows.filter((c) => c.balanceCents !== 0 || c.flag === "negative"),
    attentionCount:
      accountRows.filter((a) => a.flag).length +
      clientRows.filter((c) => c.flag === "negative").length,
  };
}