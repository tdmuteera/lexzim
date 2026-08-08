/**
 * Firm-scoped report queries (P3-12).
 * Fee AR and trust ledgers stay separate. ALWAYS filter firmId.
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  calendarEvents,
  clients,
  feePayments,
  invoices,
  matterDeadlines,
  matters,
  timeEntries,
  trustAccounts,
  trustLedgerEntries,
  users,
} from "@/lib/db/schema";
import { clientDisplayName } from "@/lib/clients/display";
import { timeEntryAmountCents } from "@/lib/billing/money";
import { OPEN_MATTER_STATUSES } from "@/lib/matters/validation";
import { toCsv } from "@/lib/reports/csv";
import { type ReportType } from "@/lib/reports/types";

export type { ReportType } from "@/lib/reports/types";
export { REPORT_TYPES, isReportType } from "@/lib/reports/types";

export type ReportFilters = {
  from?: Date;
  to?: Date;
  lawyerId?: string;
  matterId?: string;
  clientId?: string;
  trustAccountId?: string;
  groupBy?: "lawyer" | "matter";
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function agingBucket(dueDate: Date | null, now: Date): string {
  if (!dueDate || dueDate.getTime() >= now.getTime()) return "current";
  const days = daysBetween(dueDate, now);
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export async function reportArAging(firmId: string, filters: ReportFilters) {
  const db = getDb();
  const now = new Date();
  const conditions = [
    eq(invoices.firmId, firmId),
    ne(invoices.status, "void"),
    ne(invoices.status, "draft"),
  ];
  if (filters.matterId) conditions.push(eq(invoices.matterId, filters.matterId));
  if (filters.clientId) conditions.push(eq(invoices.clientId, filters.clientId));
  if (filters.from) conditions.push(gte(invoices.issueDate, filters.from));
  if (filters.to) conditions.push(lte(invoices.issueDate, filters.to));

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
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.firmId, firmId)))
    .where(and(...conditions))
    .orderBy(asc(invoices.dueDate), desc(invoices.issueDate));

  const lines = rows
    .map((r) => {
      const paidCents = Number(r.paidCents) || 0;
      const balanceCents = Math.max(0, r.invoice.totalCents - paidCents);
      if (balanceCents <= 0) return null;
      const clientName = r.clientType
        ? clientDisplayName({
            clientType: r.clientType,
            fullName: r.clientFullName,
            legalName: r.clientLegalName,
            tradingName: r.clientTradingName,
          })
        : "n/a";
      const bucket = agingBucket(r.invoice.dueDate, now);
      return {
        invoiceId: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber,
        status: r.invoice.status,
        clientName,
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
      };
    })
    .filter(Boolean) as Array<{
    invoiceId: string;
    invoiceNumber: string;
    status: string;
    clientName: string;
    matterTitle: string;
    matterNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    currency: string;
    totalCents: number;
    paidCents: number;
    balanceCents: number;
    bucket: string;
    daysPastDue: number;
  }>;

  const buckets = ["current", "1-30", "31-60", "61-90", "90+"] as const;
  const summary = buckets.map((bucket) => ({
    bucket,
    count: lines.filter((l) => l.bucket === bucket).length,
    balanceCents: lines
      .filter((l) => l.bucket === bucket)
      .reduce((s, l) => s + l.balanceCents, 0),
  }));

  return {
    title: "AR aging (fee invoices)",
    note: "Fee side only. Does not include trust balances.",
    asOf: now.toISOString(),
    summary,
    rows: lines,
  };
}

export async function reportTime(firmId: string, filters: ReportFilters) {
  const db = getDb();
  const groupBy = filters.groupBy === "matter" ? "matter" : "lawyer";
  const conditions = [eq(timeEntries.firmId, firmId)];
  if (filters.from) conditions.push(gte(timeEntries.workedAt, filters.from));
  if (filters.to) conditions.push(lte(timeEntries.workedAt, filters.to));
  if (filters.lawyerId) conditions.push(eq(timeEntries.userId, filters.lawyerId));
  if (filters.matterId) conditions.push(eq(timeEntries.matterId, filters.matterId));

  const rows = await db
    .select({
      entry: timeEntries,
      userName: users.fullName,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(timeEntries)
    .leftJoin(users, eq(users.id, timeEntries.userId))
    .innerJoin(matters, and(eq(matters.id, timeEntries.matterId), eq(matters.firmId, firmId)))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.workedAt));

  type Agg = {
    key: string;
    label: string;
    matterId?: string | null;
    lawyerId?: string | null;
    minutes: number;
    billableMinutes: number;
    amountCents: number;
    entries: number;
  };
  const map = new Map<string, Agg>();

  for (const r of rows) {
    const amount =
      r.entry.billable
        ? timeEntryAmountCents(r.entry.minutes, r.entry.rateCents) ?? 0
        : 0;
    const key =
      groupBy === "matter"
        ? r.entry.matterId
        : r.entry.userId ?? "unassigned";
    const label =
      groupBy === "matter"
        ? `${r.matterNumber ? `${r.matterNumber} · ` : ""}${r.matterTitle}`
        : r.userName ?? "Unassigned";
    const existing = map.get(key) ?? {
      key,
      label,
      matterId: groupBy === "matter" ? r.entry.matterId : null,
      lawyerId: groupBy === "lawyer" ? r.entry.userId : null,
      minutes: 0,
      billableMinutes: 0,
      amountCents: 0,
      entries: 0,
    };
    existing.minutes += r.entry.minutes;
    if (r.entry.billable) existing.billableMinutes += r.entry.minutes;
    existing.amountCents += amount;
    existing.entries += 1;
    map.set(key, existing);
  }

  const aggregated = [...map.values()].sort((a, b) => b.minutes - a.minutes);

  return {
    title: `Time by ${groupBy}`,
    note: "Billable amounts use entry rates. Fee side only.",
    groupBy,
    rows: aggregated,
    detail: rows.slice(0, 500).map((r) => ({
      id: r.entry.id,
      workedAt: r.entry.workedAt.toISOString().slice(0, 10),
      lawyer: r.userName,
      matterTitle: r.matterTitle,
      matterNumber: r.matterNumber,
      minutes: r.entry.minutes,
      billable: r.entry.billable,
      amountCents: r.entry.billable
        ? timeEntryAmountCents(r.entry.minutes, r.entry.rateCents)
        : null,
      currency: r.entry.currency,
      description: r.entry.description,
      invoiced: Boolean(r.entry.invoiceId),
    })),
  };
}

export async function reportTrustBalances(firmId: string) {
  const db = getDb();
  const accounts = await db
    .select({
      account: trustAccounts,
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
    .orderBy(desc(sql`sum(${trustLedgerEntries.amountCents})`));

  return {
    title: "Trust balances",
    note: "Trust ledger only. Not fee invoice AR.",
    accounts: accounts.map((a) => ({
      id: a.account.id,
      name: a.account.name,
      currency: a.account.currency,
      accountRef: a.account.accountRef,
      isActive: a.account.isActive,
      balanceCents: Number(a.balanceCents) || 0,
    })),
    clients: clientBalances.map((c) => ({
      clientId: c.clientId!,
      clientName: clientDisplayName({
        clientType: c.clientType,
        fullName: c.clientFullName,
        legalName: c.clientLegalName,
        tradingName: c.clientTradingName,
      }),
      currency: c.currency,
      balanceCents: Number(c.balanceCents) || 0,
    })),
  };
}

export async function reportTrustMovements(firmId: string, filters: ReportFilters) {
  const db = getDb();
  const conditions = [eq(trustLedgerEntries.firmId, firmId)];
  if (filters.from) conditions.push(gte(trustLedgerEntries.occurredAt, filters.from));
  if (filters.to) conditions.push(lte(trustLedgerEntries.occurredAt, filters.to));
  if (filters.trustAccountId) {
    conditions.push(eq(trustLedgerEntries.trustAccountId, filters.trustAccountId));
  }
  if (filters.clientId) conditions.push(eq(trustLedgerEntries.clientId, filters.clientId));
  if (filters.matterId) conditions.push(eq(trustLedgerEntries.matterId, filters.matterId));

  const rows = await db
    .select({
      entry: trustLedgerEntries,
      accountName: trustAccounts.name,
      matterTitle: matters.title,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(trustLedgerEntries)
    .innerJoin(
      trustAccounts,
      and(
        eq(trustAccounts.id, trustLedgerEntries.trustAccountId),
        eq(trustAccounts.firmId, firmId),
      ),
    )
    .leftJoin(
      matters,
      and(eq(matters.id, trustLedgerEntries.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, trustLedgerEntries.clientId), eq(clients.firmId, firmId)),
    )
    .where(and(...conditions))
    .orderBy(desc(trustLedgerEntries.occurredAt))
    .limit(1000);

  return {
    title: "Trust movements",
    note: "Trust ledger only. Not fee payments.",
    rows: rows.map((r) => ({
      id: r.entry.id,
      occurredAt: r.entry.occurredAt.toISOString(),
      entryType: r.entry.entryType,
      accountName: r.accountName,
      clientName: r.clientType
        ? clientDisplayName({
            clientType: r.clientType,
            fullName: r.clientFullName,
            legalName: r.clientLegalName,
            tradingName: r.clientTradingName,
          })
        : null,
      matterTitle: r.matterTitle,
      amountCents: r.entry.amountCents,
      currency: r.entry.currency,
      reference: r.entry.reference,
      narrative: r.entry.narrative,
    })),
  };
}

export async function reportWorkload(firmId: string, filters: ReportFilters) {
  const db = getDb();
  const conditions = [
    eq(matters.firmId, firmId),
    inArray(matters.status, [...OPEN_MATTER_STATUSES]),
  ];
  if (filters.lawyerId) {
    conditions.push(eq(matters.responsibleLawyerId, filters.lawyerId));
  }

  const rows = await db
    .select({
      matter: matters,
      lawyerName: users.fullName,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(matters)
    .leftJoin(users, eq(users.id, matters.responsibleLawyerId))
    .innerJoin(clients, and(eq(clients.id, matters.clientId), eq(clients.firmId, firmId)))
    .where(and(...conditions))
    .orderBy(asc(users.fullName), asc(matters.title));

  type Agg = {
    lawyerId: string | null;
    lawyerName: string;
    count: number;
    byStatus: Record<string, number>;
  };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const key = r.matter.responsibleLawyerId ?? "unassigned";
    const existing = map.get(key) ?? {
      lawyerId: r.matter.responsibleLawyerId,
      lawyerName: r.lawyerName ?? "Unassigned",
      count: 0,
      byStatus: {},
    };
    existing.count += 1;
    existing.byStatus[r.matter.status] = (existing.byStatus[r.matter.status] ?? 0) + 1;
    map.set(key, existing);
  }

  return {
    title: "Workload (open matters by lawyer)",
    summary: [...map.values()].sort((a, b) => b.count - a.count),
    rows: rows.map((r) => ({
      matterId: r.matter.id,
      title: r.matter.title,
      matterNumber: r.matter.matterNumber,
      status: r.matter.status,
      areaOfLaw: r.matter.areaOfLaw,
      lawyerName: r.lawyerName ?? "Unassigned",
      lawyerId: r.matter.responsibleLawyerId,
      clientName: clientDisplayName({
        clientType: r.clientType,
        fullName: r.clientFullName,
        legalName: r.clientLegalName,
        tradingName: r.clientTradingName,
      }),
      nextHearingAt: r.matter.nextHearingAt?.toISOString() ?? null,
    })),
  };
}

export async function reportUpcoming(firmId: string, filters: ReportFilters) {
  const db = getDb();
  const now = new Date();
  const from = filters.from ?? now;
  const to =
    filters.to ??
    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const hearings = await db
    .select({
      event: calendarEvents,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(calendarEvents)
    .leftJoin(
      matters,
      and(eq(matters.id, calendarEvents.matterId), eq(matters.firmId, firmId)),
    )
    .where(
      and(
        eq(calendarEvents.firmId, firmId),
        gte(calendarEvents.startsAt, from),
        lte(calendarEvents.startsAt, to),
        ...(filters.matterId ? [eq(calendarEvents.matterId, filters.matterId)] : []),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt));

  const deadlines = await db
    .select({
      deadline: matterDeadlines,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(matterDeadlines)
    .innerJoin(
      matters,
      and(eq(matters.id, matterDeadlines.matterId), eq(matters.firmId, firmId)),
    )
    .where(
      and(
        eq(matterDeadlines.firmId, firmId),
        eq(matterDeadlines.status, "open"),
        isNotNull(matterDeadlines.dueAt),
        gte(matterDeadlines.dueAt, from),
        lte(matterDeadlines.dueAt, to),
        ...(filters.matterId ? [eq(matterDeadlines.matterId, filters.matterId)] : []),
      ),
    )
    .orderBy(asc(matterDeadlines.dueAt));

  return {
    title: "Upcoming hearings and deadlines",
    from: from.toISOString(),
    to: to.toISOString(),
    hearings: hearings.map((h) => ({
      id: h.event.id,
      kind: "calendar",
      eventType: h.event.eventType,
      title: h.event.title,
      startsAt: h.event.startsAt.toISOString(),
      matterTitle: h.matterTitle,
      matterNumber: h.matterNumber,
      matterId: h.event.matterId,
    })),
    deadlines: deadlines.map((d) => ({
      id: d.deadline.id,
      kind: "deadline",
      title: d.deadline.title,
      dueAt: d.deadline.dueAt!.toISOString(),
      matterTitle: d.matterTitle,
      matterNumber: d.matterNumber,
      matterId: d.deadline.matterId,
    })),
  };
}

export async function runReport(
  firmId: string,
  type: ReportType,
  filters: ReportFilters,
) {
  switch (type) {
    case "ar-aging":
      return reportArAging(firmId, filters);
    case "time":
      return reportTime(firmId, filters);
    case "trust-balances":
      return reportTrustBalances(firmId);
    case "trust-movements":
      return reportTrustMovements(firmId, filters);
    case "workload":
      return reportWorkload(firmId, filters);
    case "upcoming":
      return reportUpcoming(firmId, filters);
  }
}

export function reportToCsv(type: ReportType, data: Awaited<ReturnType<typeof runReport>>): string {
  if (type === "ar-aging" && "rows" in data && Array.isArray(data.rows) && "summary" in data) {
    const rows = data.rows as Array<Record<string, unknown>>;
    return toCsv(
      [
        "invoiceNumber",
        "status",
        "clientName",
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
      rows.map((r) => [
        r.invoiceNumber as string,
        r.status as string,
        r.clientName as string,
        r.matterTitle as string,
        r.issueDate as string | null,
        r.dueDate as string | null,
        r.bucket as string,
        r.daysPastDue as number,
        r.currency as string,
        r.totalCents as number,
        r.paidCents as number,
        r.balanceCents as number,
      ]),
    );
  }

  if (type === "time" && "rows" in data) {
    const rows = data.rows as Array<Record<string, unknown>>;
    return toCsv(
      ["label", "minutes", "billableMinutes", "amountCents", "entries"],
      rows.map((r) => [
        r.label as string,
        r.minutes as number,
        r.billableMinutes as number,
        r.amountCents as number,
        r.entries as number,
      ]),
    );
  }

  if (type === "trust-balances" && "accounts" in data && "clients" in data) {
    const accounts = data.accounts as Array<Record<string, unknown>>;
    const clientsRows = data.clients as Array<Record<string, unknown>>;
    const accountCsv = toCsv(
      ["section", "name", "currency", "balanceCents", "isActive"],
      accounts.map((a) => [
        "account",
        a.name as string,
        a.currency as string,
        a.balanceCents as number,
        a.isActive as boolean,
      ]),
    );
    const clientCsv = toCsv(
      ["section", "name", "currency", "balanceCents", "isActive"],
      clientsRows.map((c) => [
        "client",
        c.clientName as string,
        c.currency as string,
        c.balanceCents as number,
        "",
      ]),
    );
    // Drop second header: concatenate body only
    const clientBody = clientCsv.split("\n").slice(1).join("\n");
    return accountCsv.trimEnd() + "\n" + clientBody;
  }

  if (type === "trust-movements" && "rows" in data) {
    const rows = data.rows as Array<Record<string, unknown>>;
    return toCsv(
      [
        "occurredAt",
        "entryType",
        "accountName",
        "clientName",
        "matterTitle",
        "amountCents",
        "currency",
        "reference",
        "narrative",
      ],
      rows.map((r) => [
        r.occurredAt as string,
        r.entryType as string,
        r.accountName as string,
        r.clientName as string | null,
        r.matterTitle as string | null,
        r.amountCents as number,
        r.currency as string,
        r.reference as string | null,
        r.narrative as string | null,
      ]),
    );
  }

  if (type === "workload" && "rows" in data) {
    const rows = data.rows as Array<Record<string, unknown>>;
    return toCsv(
      [
        "matterNumber",
        "title",
        "status",
        "areaOfLaw",
        "lawyerName",
        "clientName",
        "nextHearingAt",
      ],
      rows.map((r) => [
        r.matterNumber as string | null,
        r.title as string,
        r.status as string,
        r.areaOfLaw as string,
        r.lawyerName as string,
        r.clientName as string,
        r.nextHearingAt as string | null,
      ]),
    );
  }

  if (type === "upcoming" && "hearings" in data && "deadlines" in data) {
    const hearings = data.hearings as Array<Record<string, unknown>>;
    const deadlines = data.deadlines as Array<Record<string, unknown>>;
    return toCsv(
      ["kind", "when", "eventType", "title", "matterNumber", "matterTitle"],
      [
        ...hearings.map((h) => [
          "calendar",
          h.startsAt as string,
          h.eventType as string,
          h.title as string,
          h.matterNumber as string | null,
          h.matterTitle as string | null,
        ]),
        ...deadlines.map((d) => [
          "deadline",
          d.dueAt as string,
          "deadline",
          d.title as string,
          d.matterNumber as string | null,
          d.matterTitle as string | null,
        ]),
      ],
    );
  }

  return toCsv(["error"], [["Unsupported report CSV"]]);
}
