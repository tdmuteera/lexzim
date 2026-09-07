/**
 * Finance → Client accounts read model (P11-06).
 * Reuses trust, invoices, fee payments, disbursements, payment intakes. No duplicate ledgers.
 */
import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import {
  clients,
  disbursements,
  financePaymentIntakes,
  invoices,
  matters,
  trustLedgerEntries,
} from "@/lib/db/schema";
import {
  listFeePayments,
  listInvoices,
  sumFeePaymentsByInvoice,
} from "@/lib/repos/billing";
import { listClients, userCanAccessClient } from "@/lib/repos/clients";
import { listPaymentIntakes } from "@/lib/repos/payment-intakes";
import { listRecoverableRequisitions } from "@/lib/repos/requisitions";
import {
  getClientTrustBalance,
  getClientTrustStatement,
} from "@/lib/repos/trust";

export type ClientAccountIndexRow = {
  clientId: string;
  clientNumber: string;
  displayName: string;
  currency: string;
  trustBalanceCents: number;
  feesBilledCents: number;
  feesPaidCents: number;
  feesOutstandingCents: number;
  unbilledDisbursementCents: number;
  intakeCount: number;
};

export type ClientAccountDetail = {
  client: {
    id: string;
    clientNumber: string;
    displayName: string;
    currency: string;
  };
  labels: {
    trust: string;
    fees: string;
    disbursements: string;
  };
  trust: {
    balanceCents: number;
    recentMovements: Array<{
      id: string;
      occurredAt: string;
      entryType: string;
      amountCents: number;
      runningBalanceCents: number;
      accountName: string;
      matterTitle: string | null;
      referenceNumber: string | null;
      narrative: string | null;
    }>;
  };
  fees: {
    billedCents: number;
    paidCents: number;
    outstandingCents: number;
    retainerAppliedCents: number;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      status: string;
      matterId: string;
      matterTitle: string | null;
      matterNumber: string | null;
      totalCents: number;
      paidCents: number;
      retainerAppliedCents: number;
      balanceCents: number;
      currency: string;
      issuedAt: string | null;
    }>;
    feePayments: Array<{
      id: string;
      invoiceId: string;
      invoiceNumber: string | null;
      receiptNumber: string | null;
      amountCents: number;
      currency: string;
      paidAt: string;
      method: string | null;
    }>;
  };
  disbursements: {
    unbilledCents: number;
    unbilled: Array<{
      id: string;
      matterId: string;
      matterTitle: string | null;
      matterNumber: string | null;
      description: string;
      amountCents: number;
      currency: string;
      incurredAt: string;
      paidFrom: string | null;
    }>;
  };
  paymentIntakes: Array<{
    id: string;
    receiptNumber: string | null;
    receivedAt: string;
    amountCents: number;
    currency: string;
    destination: string;
    matterTitle: string | null;
    matterNumber: string | null;
    lineCount: number;
  }>;
  recoverableRequisitions: Array<{
    id: string;
    description: string;
    amountCents: number;
    currency: string;
    matterTitle: string | null;
    matterNumber: string | null;
    paidAt: string | null;
  }>;
};

async function unbilledDisbursementTotalsByClient(
  firmId: string,
  clientIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (clientIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      clientId: matters.clientId,
      total: sql<number>`coalesce(sum(${disbursements.amountCents}), 0)::int`,
    })
    .from(disbursements)
    .innerJoin(
      matters,
      and(eq(matters.id, disbursements.matterId), eq(matters.firmId, firmId)),
    )
    .where(
      and(
        eq(disbursements.firmId, firmId),
        eq(disbursements.billable, true),
        isNull(disbursements.invoiceId),
        inArray(matters.clientId, clientIds),
      ),
    )
    .groupBy(matters.clientId);

  for (const row of rows) {
    if (row.clientId) map.set(row.clientId, Number(row.total) || 0);
  }
  return map;
}

async function feeTotalsByClient(
  firmId: string,
  clientIds: string[],
): Promise<
  Map<
    string,
    { billedCents: number; paidCents: number; outstandingCents: number }
  >
> {
  const map = new Map<
    string,
    { billedCents: number; paidCents: number; outstandingCents: number }
  >();
  if (clientIds.length === 0) return map;

  const db = getDb();
  const invRows = await db
    .select({
      clientId: invoices.clientId,
      totalCents: invoices.totalCents,
      retainerAppliedCents: invoices.retainerAppliedCents,
      status: invoices.status,
      id: invoices.id,
    })
    .from(invoices)
    .where(
      and(eq(invoices.firmId, firmId), inArray(invoices.clientId, clientIds)),
    );

  const paidMap = await sumFeePaymentsByInvoice(firmId);
  for (const row of invRows) {
    if (!row.clientId || row.status === "void" || row.status === "draft") continue;
    const paid = paidMap.get(row.id) ?? 0;
    const retainer = row.retainerAppliedCents ?? 0;
    const outstanding = Math.max(0, row.totalCents - paid - retainer);
    const prev = map.get(row.clientId) ?? {
      billedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
    };
    prev.billedCents += row.totalCents;
    prev.paidCents += paid + retainer;
    prev.outstandingCents += outstanding;
    map.set(row.clientId, prev);
  }
  return map;
}

async function intakeCountsByClient(
  firmId: string,
  clientIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (clientIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      clientId: financePaymentIntakes.clientId,
      count: sql<number>`count(*)::int`,
    })
    .from(financePaymentIntakes)
    .where(
      and(
        eq(financePaymentIntakes.firmId, firmId),
        inArray(financePaymentIntakes.clientId, clientIds),
      ),
    )
    .groupBy(financePaymentIntakes.clientId);
  for (const row of rows) {
    map.set(row.clientId, Number(row.count) || 0);
  }
  return map;
}

async function trustBalancesByClient(
  firmId: string,
  clientIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (clientIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      clientId: trustLedgerEntries.clientId,
      total: sql<number>`coalesce(sum(${trustLedgerEntries.amountCents}), 0)::int`,
    })
    .from(trustLedgerEntries)
    .where(
      and(
        eq(trustLedgerEntries.firmId, firmId),
        inArray(trustLedgerEntries.clientId, clientIds),
      ),
    )
    .groupBy(trustLedgerEntries.clientId);
  for (const row of rows) {
    if (row.clientId) map.set(row.clientId, Number(row.total) || 0);
  }
  return map;
}

export async function listClientAccountSummaries(
  firmId: string,
  opts: {
    q?: string;
    viewAll: boolean;
    userId: string;
    currency?: string;
    limit?: number;
  },
): Promise<ClientAccountIndexRow[]> {
  const currency = opts.currency || "USD";
  const rows = await listClients(firmId, {
    q: opts.q,
    archived: "active",
    viewAll: opts.viewAll,
    userId: opts.userId,
    sort: "name",
  });
  const limited = rows.slice(0, opts.limit ?? 200);
  const ids = limited.map((c) => c.id);

  const [trustMap, feeMap, unbilledMap, intakeMap] = await Promise.all([
    trustBalancesByClient(firmId, ids),
    feeTotalsByClient(firmId, ids),
    unbilledDisbursementTotalsByClient(firmId, ids),
    intakeCountsByClient(firmId, ids),
  ]);

  return limited.map((c) => {
    const fees = feeMap.get(c.id) ?? {
      billedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
    };
    return {
      clientId: c.id,
      clientNumber: c.clientNumber,
      displayName: clientDisplayName(c),
      currency,
      trustBalanceCents: trustMap.get(c.id) ?? 0,
      feesBilledCents: fees.billedCents,
      feesPaidCents: fees.paidCents,
      feesOutstandingCents: fees.outstandingCents,
      unbilledDisbursementCents: unbilledMap.get(c.id) ?? 0,
      intakeCount: intakeMap.get(c.id) ?? 0,
    };
  });
}

export async function getClientAccountDetail(
  firmId: string,
  clientId: string,
  opts: {
    viewAll: boolean;
    userId: string;
    currency?: string;
    matterId?: string;
  },
): Promise<ClientAccountDetail> {
  const allowed = await userCanAccessClient(
    firmId,
    clientId,
    opts.userId,
    opts.viewAll,
  );
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this client account.");
  }

  const db = getDb();
  const clientRows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
    .limit(1);
  const client = clientRows[0];
  if (!client) throw new AuthError("not_found", "Client not found.");

  const currency = opts.currency || "USD";
  const matterId = opts.matterId;

  const matterRows = await db
    .select({
      id: matters.id,
      title: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(matters)
    .where(
      and(
        eq(matters.firmId, firmId),
        eq(matters.clientId, clientId),
        ...(matterId ? [eq(matters.id, matterId)] : []),
      ),
    );
  const matterIds = matterRows.map((m) => m.id);
  const matterMeta = new Map(
    matterRows.map((m) => [m.id, { title: m.title, matterNumber: m.matterNumber }]),
  );

  const [trustBalance, statement, allInvoices, paidByInvoice, intakes, recoverable] =
    await Promise.all([
      getClientTrustBalance(firmId, clientId, matterId ? { matterId } : undefined),
      getClientTrustStatement(firmId, clientId),
      listInvoices(firmId),
      sumFeePaymentsByInvoice(firmId),
      listPaymentIntakes(firmId, {
        clientId,
        matterId,
        limit: 50,
      }),
      listRecoverableRequisitions(firmId, { clientId, limit: 50 }),
    ]);

  const clientInvoices = allInvoices.filter(
    (row) =>
      row.invoice.clientId === clientId &&
      row.invoice.status !== "void" &&
      row.invoice.status !== "draft" &&
      (!matterId || row.invoice.matterId === matterId),
  );

  let billedCents = 0;
  let paidCents = 0;
  let outstandingCents = 0;
  let retainerAppliedCents = 0;
  const invoicePayload = clientInvoices.map((row) => {
    const paid = paidByInvoice.get(row.invoice.id) ?? 0;
    const retainer = row.invoice.retainerAppliedCents ?? 0;
    const balance = Math.max(0, row.invoice.totalCents - paid - retainer);
    billedCents += row.invoice.totalCents;
    paidCents += paid + retainer;
    outstandingCents += balance;
    retainerAppliedCents += retainer;
    return {
      id: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      status: row.invoice.status,
      matterId: row.invoice.matterId,
      matterTitle: row.matterTitle,
      matterNumber: row.matterNumber,
      totalCents: row.invoice.totalCents,
      paidCents: paid,
      retainerAppliedCents: retainer,
      balanceCents: balance,
      currency: row.invoice.currency,
      issuedAt: row.invoice.issueDate?.toISOString() ?? null,
    };
  });

  const feePaymentRows: ClientAccountDetail["fees"]["feePayments"] = [];
  for (const inv of invoicePayload.slice(0, 40)) {
    const payments = await listFeePayments(firmId, inv.id);
    for (const p of payments) {
      feePaymentRows.push({
        id: p.id,
        invoiceId: p.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        receiptNumber: p.receiptNumber,
        amountCents: p.amountCents,
        currency: p.currency,
        paidAt: p.paidAt.toISOString(),
        method: p.method,
      });
    }
  }
  feePaymentRows.sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  let unbilled: ClientAccountDetail["disbursements"]["unbilled"] = [];
  if (matterIds.length > 0) {
    const dRows = await db
      .select()
      .from(disbursements)
      .where(
        and(
          eq(disbursements.firmId, firmId),
          inArray(disbursements.matterId, matterIds),
          eq(disbursements.billable, true),
          isNull(disbursements.invoiceId),
        ),
      )
      .orderBy(desc(disbursements.incurredAt));
    unbilled = dRows.map((d) => {
      const meta = matterMeta.get(d.matterId);
      return {
        id: d.id,
        matterId: d.matterId,
        matterTitle: meta?.title ?? null,
        matterNumber: meta?.matterNumber ?? null,
        description: d.description,
        amountCents: d.amountCents,
        currency: d.currency,
        incurredAt: d.incurredAt.toISOString(),
        paidFrom: d.paidFrom,
      };
    });
  }
  const unbilledCents = unbilled.reduce((s, d) => s + d.amountCents, 0);

  const recentMovements = statement.lines
    .filter((line) => !matterId || line.entry.matterId === matterId)
    .slice(-25)
    .reverse()
    .map((line) => ({
      id: line.entry.id,
      occurredAt: line.entry.occurredAt.toISOString(),
      entryType: line.entry.entryType,
      amountCents: line.entry.amountCents,
      runningBalanceCents: line.runningBalanceCents,
      accountName: line.accountName,
      matterTitle: line.matterTitle,
      referenceNumber: line.entry.referenceNumber,
      narrative: line.entry.narrative,
    }));

  // Prefer live balance; statement end may differ if filtered by matter
  const balanceCents = matterId ? trustBalance : statement.balanceCents;

  return {
    client: {
      id: client.id,
      clientNumber: client.clientNumber,
      displayName: clientDisplayName(client),
      currency,
    },
    labels: {
      trust: "Trust money (client liability; not firm fees)",
      fees: "Firm fee revenue (invoices and fee receipts)",
      disbursements: "Client costs / disbursements (not firm profit)",
    },
    trust: {
      balanceCents,
      recentMovements,
    },
    fees: {
      billedCents,
      paidCents,
      outstandingCents,
      retainerAppliedCents,
      invoices: invoicePayload,
      feePayments: feePaymentRows.slice(0, 40),
    },
    disbursements: {
      unbilledCents,
      unbilled,
    },
    paymentIntakes: intakes.map((row) => ({
      id: row.intake.id,
      receiptNumber: row.intake.receiptNumber,
      receivedAt: row.intake.receivedAt.toISOString(),
      amountCents: row.intake.amountCents,
      currency: row.intake.currency,
      destination: row.intake.destination,
      matterTitle: row.matterTitle,
      matterNumber: row.matterNumber,
      lineCount: row.lineCount,
    })),
    recoverableRequisitions: recoverable
      .filter((r) => !matterId || r.matterId === matterId)
      .map((r) => ({
        id: r.id,
        description: r.description,
        amountCents: r.amountCents,
        currency: r.currency,
        matterTitle: r.matterTitle,
        matterNumber: r.matterNumber,
        paidAt: r.paidAt?.toISOString() ?? null,
      })),
  };
}
