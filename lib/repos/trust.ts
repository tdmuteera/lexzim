/**
 * Trust ledger (P3-08). NEVER mix with fee_payments.
 * EVERY firm-scoped query MUST filter firmId.
 * amount_cents is signed: credit (+) increases client trust liability held.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb, lockFinanceKey, runInTransaction } from "@/lib/db";
import { clients, matters, trustAccounts, trustLedgerEntries, trustVaultBankIns, trustVaultCounts } from "@/lib/db/schema";
import {
  signedTrustAmount,
  type TrustAccountInput,
  type TrustLedgerInput,
} from "@/lib/trust/validation";
import type { VaultBankInInput, VaultCountInput } from "@/lib/trust/vault-validation";
import { allocateTrustReferenceNumber } from "@/lib/repos/firm-settings";
import { postTrustLedgerGl, reverseTrustLedgerGl } from "@/lib/gl/posting-trust";

export async function listTrustAccounts(firmId: string, activeOnly = true) {
  const db = getDb();
  const conditions = [eq(trustAccounts.firmId, firmId)];
  if (activeOnly) conditions.push(eq(trustAccounts.isActive, true));
  return db
    .select()
    .from(trustAccounts)
    .where(and(...conditions))
    .orderBy(asc(trustAccounts.name));
}

export async function getTrustAccount(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(trustAccounts)
    .where(and(eq(trustAccounts.firmId, firmId), eq(trustAccounts.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createTrustAccount(firmId: string, input: TrustAccountInput) {
  const db = getDb();
  const rows = await db
    .insert(trustAccounts)
    .values({
      firmId,
      name: input.name,
      currency: input.currency,
      accountRef: input.accountRef,
      accountKind: input.accountKind,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateTrustAccount(
  firmId: string,
  id: string,
  input: TrustAccountInput,
) {
  const db = getDb();
  const rows = await db
    .update(trustAccounts)
    .set({
      name: input.name,
      currency: input.currency,
      accountRef: input.accountRef,
      accountKind: input.accountKind,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(trustAccounts.firmId, firmId), eq(trustAccounts.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function getTrustAccountBalance(
  firmId: string,
  trustAccountId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${trustLedgerEntries.amountCents}), 0)::int`,
    })
    .from(trustLedgerEntries)
    .where(
      and(
        eq(trustLedgerEntries.firmId, firmId),
        eq(trustLedgerEntries.trustAccountId, trustAccountId),
      ),
    );
  return rows[0]?.total ?? 0;
}

/** Sum of client-tagged ledger entries on a trust account (three-way recon). */
export async function getClientTrustSumOnAccount(
  firmId: string,
  trustAccountId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${trustLedgerEntries.amountCents}), 0)::int`,
    })
    .from(trustLedgerEntries)
    .where(
      and(
        eq(trustLedgerEntries.firmId, firmId),
        eq(trustLedgerEntries.trustAccountId, trustAccountId),
        isNotNull(trustLedgerEntries.clientId),
      ),
    );
  return rows[0]?.total ?? 0;
}

export async function getClientTrustBalance(
  firmId: string,
  clientId: string,
  opts?: { matterId?: string; trustAccountId?: string },
): Promise<number> {
  const db = getDb();
  const conditions = [
    eq(trustLedgerEntries.firmId, firmId),
    eq(trustLedgerEntries.clientId, clientId),
  ];
  if (opts?.matterId) conditions.push(eq(trustLedgerEntries.matterId, opts.matterId));
  if (opts?.trustAccountId) {
    conditions.push(eq(trustLedgerEntries.trustAccountId, opts.trustAccountId));
  }
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${trustLedgerEntries.amountCents}), 0)::int`,
    })
    .from(trustLedgerEntries)
    .where(and(...conditions));
  return rows[0]?.total ?? 0;
}

export async function getTrustLedgerEntry(firmId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(trustLedgerEntries)
    .where(and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTrustLedger(
  firmId: string,
  opts?: {
    trustAccountId?: string;
    matterId?: string;
    clientId?: string;
    limit?: number;
  },
) {
  const db = getDb();
  const conditions = [eq(trustLedgerEntries.firmId, firmId)];
  if (opts?.trustAccountId) {
    conditions.push(eq(trustLedgerEntries.trustAccountId, opts.trustAccountId));
  }
  if (opts?.matterId) conditions.push(eq(trustLedgerEntries.matterId, opts.matterId));
  if (opts?.clientId) conditions.push(eq(trustLedgerEntries.clientId, opts.clientId));

  return db
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
    .orderBy(desc(trustLedgerEntries.occurredAt), desc(trustLedgerEntries.createdAt))
    .limit(opts?.limit ?? 200);
}

/**
 * Client statement: chronological entries with running balance.
 * Never includes fee_payments.
 */
export async function getClientTrustStatement(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select({
      entry: trustLedgerEntries,
      accountName: trustAccounts.name,
      matterTitle: matters.title,
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
    .where(
      and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.clientId, clientId)),
    )
    .orderBy(asc(trustLedgerEntries.occurredAt), asc(trustLedgerEntries.createdAt));

  let running = 0;
  const lines = rows.map((r) => {
    running += r.entry.amountCents;
    return {
      entry: r.entry,
      accountName: r.accountName,
      matterTitle: r.matterTitle,
      runningBalanceCents: running,
    };
  });

  return { lines, balanceCents: running };
}

export type TrustClientBalanceRow = {
  clientId: string;
  clientName: string;
  currency: string;
  balanceCents: number;
};

export type TrustOverview = {
  accounts: Array<{
    id: string;
    name: string;
    currency: string;
    accountRef: string | null;
    accountKind: string;
    isActive: boolean;
    balanceCents: number;
  }>;
  clientBalances: TrustClientBalanceRow[];
  clientTotalsByCurrency: Array<{
    currency: string;
    totalBalanceCents: number;
    clientCount: number;
  }>;
  accountTotalsByCurrency: Array<{
    currency: string;
    totalBalanceCents: number;
  }>;
};

/** Firm-wide trust snapshot: accounts, per-client balances, and currency totals. */
export async function getTrustOverview(firmId: string): Promise<TrustOverview> {
  const db = getDb();

  const accountRows = await db
    .select({
      account: trustAccounts,
      balanceCents: sql<number>`coalesce((
        select sum(tle.amount_cents) from trust_ledger_entries tle
        where tle.firm_id = ${firmId} and tle.trust_account_id = "trust_accounts"."id"
      ), 0)::int`,
    })
    .from(trustAccounts)
    .where(eq(trustAccounts.firmId, firmId))
    .orderBy(asc(trustAccounts.name));

  const clientRows = await db
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

  const accounts = accountRows.map((row) => ({
    id: row.account.id,
    name: row.account.name,
    currency: row.account.currency,
    accountRef: row.account.accountRef,
    accountKind: row.account.accountKind,
    isActive: row.account.isActive,
    balanceCents: Number(row.balanceCents) || 0,
  }));

  const clientBalances: TrustClientBalanceRow[] = clientRows
    .map((row) => ({
      clientId: row.clientId!,
      clientName: clientDisplayName({
        clientType: row.clientType,
        fullName: row.clientFullName,
        legalName: row.clientLegalName,
        tradingName: row.clientTradingName,
      }),
      currency: row.currency,
      balanceCents: Number(row.balanceCents) || 0,
    }))
    .filter((row) => row.balanceCents !== 0);

  const clientTotalsMap = new Map<string, { total: number; count: number }>();
  for (const row of clientBalances) {
    const entry = clientTotalsMap.get(row.currency) ?? { total: 0, count: 0 };
    entry.total += row.balanceCents;
    entry.count += 1;
    clientTotalsMap.set(row.currency, entry);
  }

  const accountTotalsMap = new Map<string, number>();
  for (const account of accounts) {
    accountTotalsMap.set(
      account.currency,
      (accountTotalsMap.get(account.currency) ?? 0) + account.balanceCents,
    );
  }

  return {
    accounts,
    clientBalances,
    clientTotalsByCurrency: [...clientTotalsMap.entries()]
      .map(([currency, { total, count }]) => ({
        currency,
        totalBalanceCents: total,
        clientCount: count,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    accountTotalsByCurrency: [...accountTotalsMap.entries()]
      .map(([currency, totalBalanceCents]) => ({ currency, totalBalanceCents }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

type TrustEntryRow = typeof trustLedgerEntries.$inferSelect;

/** Client must belong to the firm; a matter, when given, must belong to that client. */
export async function assertTrustClientMatter(
  firmId: string,
  clientId: string,
  matterId: string | null | undefined,
) {
  const db = getDb();
  const c = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
    .limit(1);
  if (!c[0]) throw new AuthError("validation", "Client not found in this firm.");
  if (!matterId) return;
  const m = await db
    .select({ clientId: matters.clientId })
    .from(matters)
    .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
    .limit(1);
  if (!m[0]) throw new AuthError("validation", "Matter not found in this firm.");
  if (m[0].clientId !== clientId) {
    throw new AuthError(
      "validation",
      "That matter belongs to a different client. Trust money cannot be posted across clients.",
    );
  }
}

/** Serialise all movements on one client's trust funds for the current transaction. */
export async function lockClientTrust(firmId: string, clientId: string) {
  await lockFinanceKey(`trust:${firmId}:${clientId}`);
}

function overrideAuthorised(input: TrustLedgerInput) {
  return Boolean(input.allowNegative && input.authorisedBy && input.overrideReason);
}

async function assertClientCanFund(
  firmId: string,
  input: TrustLedgerInput,
  debitCents: number,
  trustAccountId: string,
) {
  if (debitCents <= 0 || overrideAuthorised(input)) return;
  const bal = await getClientTrustBalance(firmId, input.clientId!, { trustAccountId });
  if (bal - debitCents < 0) {
    throw new AuthError(
      "validation",
      `Insufficient client trust funds on this account (available ${bal}, required ${debitCents}). ` +
        "Only the Managing Partner can authorise an overdraw, with a reason.",
    );
  }
}

async function findByIdempotencyKey(firmId: string, key: string) {
  const db = getDb();
  const first = await db
    .select()
    .from(trustLedgerEntries)
    .where(and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.idempotencyKey, key)))
    .limit(1);
  const row = first[0];
  if (!row) return null;
  if (!row.transferGroupId) return [row];
  return db
    .select()
    .from(trustLedgerEntries)
    .where(
      and(
        eq(trustLedgerEntries.firmId, firmId),
        eq(trustLedgerEntries.transferGroupId, row.transferGroupId),
      ),
    )
    .orderBy(asc(trustLedgerEntries.amountCents));
}

function linkFields(input: TrustLedgerInput) {
  return {
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    invoiceId: input.invoiceId ?? null,
    requisitionId: input.requisitionId ?? null,
    intakeId: input.intakeId ?? null,
    authorisedBy: overrideAuthorised(input) ? input.authorisedBy! : null,
    authorisationNote: overrideAuthorised(input) ? input.overrideReason! : null,
  };
}

export async function postTrustLedgerEntry(
  firmId: string,
  userId: string,
  input: TrustLedgerInput,
): Promise<{ entries: TrustEntryRow[]; replayed?: boolean }> {
  return runInTransaction(async () => {
    if (!input.clientId) {
      throw new AuthError(
        "validation",
        "Client is required. Trust money is always held for a named client.",
      );
    }
    if (input.idempotencyKey) {
      const prior = await findByIdempotencyKey(firmId, input.idempotencyKey);
      if (prior) return { entries: prior, replayed: true };
    }

    const account = await getTrustAccount(firmId, input.trustAccountId);
    if (!account || !account.isActive) {
      throw new AuthError("validation", "Active trust account not found.");
    }
    if (input.currency && input.currency !== account.currency) {
      throw new AuthError(
        "validation",
        `Currency ${input.currency} does not match the trust account currency ${account.currency}.`,
      );
    }
    await assertTrustClientMatter(firmId, input.clientId, input.matterId);
    await lockClientTrust(firmId, input.clientId);

    if (input.entryType === "transfer") {
      return postTransfer(firmId, userId, input, account.currency);
    }

    const signed = signedTrustAmount(
      input.entryType,
      input.amountCents,
      input.adjustmentCredit,
    );
    await assertClientCanFund(firmId, input, signed < 0 ? -signed : 0, input.trustAccountId);

    let referenceNumber = input.referenceNumber ?? input.reference;
    if (
      (input.entryType === "receipt" || input.entryType === "disbursement") &&
      !referenceNumber
    ) {
      referenceNumber = await allocateTrustReferenceNumber(firmId);
    }
    const reference = input.reference ?? referenceNumber;

    const rows = await getDb()
      .insert(trustLedgerEntries)
      .values({
        firmId,
        trustAccountId: input.trustAccountId,
        matterId: input.matterId,
        clientId: input.clientId,
        entryType: input.entryType,
        amountCents: signed,
        currency: account.currency,
        occurredAt: input.occurredAt,
        reference,
        referenceNumber,
        narrative: input.narrative,
        idempotencyKey: input.idempotencyKey ?? null,
        ...linkFields(input),
        createdBy: userId,
      })
      .returning();

    if (!input.skipGl) {
      await postTrustLedgerGl(firmId, userId, rows[0]!.id);
    }

    return { entries: [rows[0]!] };
  });
}

async function postTransfer(
  firmId: string,
  userId: string,
  input: TrustLedgerInput,
  fromCurrency: string,
) {
  const toAccount = await getTrustAccount(firmId, input.transferToAccountId!);
  if (!toAccount || !toAccount.isActive) {
    throw new AuthError("validation", "Destination trust account not found.");
  }
  if (toAccount.currency !== fromCurrency) {
    throw new AuthError(
      "validation",
      "Trust transfers must be between accounts of the same currency.",
    );
  }

  await assertClientCanFund(firmId, input, input.amountCents, input.trustAccountId);

  const narrative =
    input.narrative ||
    `Transfer ${input.amountCents} between trust accounts`;
  const transferGroupId = randomUUID();

  const db = getDb();
  const outRows = await db
    .insert(trustLedgerEntries)
    .values({
      firmId,
      trustAccountId: input.trustAccountId,
      matterId: input.matterId,
      clientId: input.clientId,
      entryType: "transfer",
      amountCents: -input.amountCents,
      currency: fromCurrency,
      occurredAt: input.occurredAt,
      reference: input.reference,
      narrative: `${narrative} (out)`,
      transferGroupId,
      idempotencyKey: input.idempotencyKey ?? null,
      ...linkFields(input),
      createdBy: userId,
    })
    .returning();

  const inRows = await db
    .insert(trustLedgerEntries)
    .values({
      firmId,
      trustAccountId: input.transferToAccountId!,
      matterId: input.matterId,
      clientId: input.clientId,
      entryType: "transfer",
      amountCents: input.amountCents,
      currency: toAccount.currency,
      occurredAt: input.occurredAt,
      reference: input.reference,
      narrative: `${narrative} (in)`,
      transferGroupId,
      ...linkFields(input),
      createdBy: userId,
    })
    .returning();

  return { entries: [outRows[0]!, inRows[0]!] };
}

export type ClientTransferInput = {
  trustAccountId: string;
  fromClientId: string;
  fromMatterId: string | null;
  toClientId: string;
  toMatterId: string | null;
  amountCents: number;
  occurredAt: Date;
  reason: string;
  reference: string | null;
  idempotencyKey: string | null;
};

/**
 * Explicit, authorised movement of trust money from one client to another
 * (e.g. on the written instruction of the paying client). Never implicit.
 */
export async function postClientToClientTransfer(
  firmId: string,
  actor: { id: string; isManagingPartner: boolean },
  input: ClientTransferInput,
) {
  if (!actor.isManagingPartner) {
    throw new AuthError(
      "forbidden",
      "Only the Managing Partner can authorise moving trust money between clients.",
    );
  }
  if (!input.reason.trim()) {
    throw new AuthError("validation", "A reason (client instruction) is required.");
  }
  if (input.fromClientId === input.toClientId) {
    throw new AuthError("validation", "Source and destination clients must differ.");
  }
  return runInTransaction(async () => {
    if (input.idempotencyKey) {
      const prior = await findByIdempotencyKey(firmId, input.idempotencyKey);
      if (prior) return { entries: prior, replayed: true };
    }
    const account = await getTrustAccount(firmId, input.trustAccountId);
    if (!account || !account.isActive) {
      throw new AuthError("validation", "Active trust account not found.");
    }
    await assertTrustClientMatter(firmId, input.fromClientId, input.fromMatterId);
    await assertTrustClientMatter(firmId, input.toClientId, input.toMatterId);
    const [first, second] = [input.fromClientId, input.toClientId].sort();
    await lockClientTrust(firmId, first!);
    await lockClientTrust(firmId, second!);

    const bal = await getClientTrustBalance(firmId, input.fromClientId, {
      trustAccountId: input.trustAccountId,
    });
    if (bal < input.amountCents) {
      throw new AuthError(
        "validation",
        `Insufficient trust funds for the paying client (available ${bal}, required ${input.amountCents}).`,
      );
    }

    const transferGroupId = randomUUID();
    const base = {
      firmId,
      trustAccountId: input.trustAccountId,
      entryType: "transfer",
      currency: account.currency,
      occurredAt: input.occurredAt,
      reference: input.reference,
      sourceType: "client_transfer",
      sourceId: transferGroupId,
      transferGroupId,
      authorisedBy: actor.id,
      authorisationNote: input.reason.trim(),
      createdBy: actor.id,
    };
    const db = getDb();
    const out = await db
      .insert(trustLedgerEntries)
      .values({
        ...base,
        clientId: input.fromClientId,
        matterId: input.fromMatterId,
        counterpartyClientId: input.toClientId,
        amountCents: -input.amountCents,
        narrative: `Client to client transfer (out): ${input.reason.trim()}`,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    const inn = await db
      .insert(trustLedgerEntries)
      .values({
        ...base,
        clientId: input.toClientId,
        matterId: input.toMatterId,
        counterpartyClientId: input.fromClientId,
        amountCents: input.amountCents,
        narrative: `Client to client transfer (in): ${input.reason.trim()}`,
      })
      .returning();
    return { entries: [out[0]!, inn[0]!] };
  });
}

/**
 * Reverse a manual trust posting with a contra row. The original stays on the
 * ledger, linked both ways; transfers reverse every leg together.
 */
export async function reverseTrustEntry(
  firmId: string,
  actor: { id: string; isManagingPartner: boolean },
  entryId: string,
  reason: string,
  opts?: { fromSource?: boolean },
) {
  if (!reason.trim()) {
    throw new AuthError("validation", "A reason is required to reverse a trust entry.");
  }
  return runInTransaction(async () => {
    const db = getDb();
    const found = await db
      .select()
      .from(trustLedgerEntries)
      .where(and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.id, entryId)))
      .limit(1);
    const original = found[0];
    if (!original) throw new AuthError("not_found", "Trust entry not found.");
    if (original.reversalOfId) {
      throw new AuthError("validation", "This entry is itself a reversal and cannot be reversed.");
    }
    if (
      !opts?.fromSource &&
      original.sourceType &&
      !["manual", "client_transfer", "vault_bank_in"].includes(original.sourceType)
    ) {
      throw new AuthError(
        "validation",
        `This entry was created by a ${original.sourceType.replace("_", " ")}. Reverse it from that record so all linked postings reverse together.`,
      );
    }
    if (original.sourceType === "client_transfer" && !actor.isManagingPartner) {
      throw new AuthError("forbidden", "Only the Managing Partner can reverse a client to client transfer.");
    }

    const legs = original.transferGroupId
      ? await db
          .select()
          .from(trustLedgerEntries)
          .where(
            and(
              eq(trustLedgerEntries.firmId, firmId),
              eq(trustLedgerEntries.transferGroupId, original.transferGroupId),
            ),
          )
      : [original];
    if (legs.some((l) => l.reversedById)) {
      throw new AuthError("validation", "This entry has already been reversed.");
    }

    const clientIds = [...new Set(legs.map((l) => l.clientId).filter(Boolean) as string[])].sort();
    for (const c of clientIds) await lockClientTrust(firmId, c);

    for (const leg of legs) {
      if (leg.amountCents > 0 && leg.clientId) {
        const bal = await getClientTrustBalance(firmId, leg.clientId, {
          trustAccountId: leg.trustAccountId,
        });
        if (bal - leg.amountCents < 0) {
          throw new AuthError(
            "validation",
            `Reversal would make the client trust balance negative (available ${bal}, reversing ${leg.amountCents}). The funds have already been used.`,
          );
        }
      }
    }

    const reversalGroupId = original.transferGroupId ? randomUUID() : null;
    const contras: TrustEntryRow[] = [];
    for (const leg of legs) {
      const [contra] = await db
        .insert(trustLedgerEntries)
        .values({
          firmId,
          trustAccountId: leg.trustAccountId,
          matterId: leg.matterId,
          clientId: leg.clientId,
          entryType: leg.entryType,
          amountCents: -leg.amountCents,
          currency: leg.currency,
          occurredAt: new Date(),
          reference: leg.reference,
          referenceNumber: leg.referenceNumber ? `${leg.referenceNumber}-REV` : null,
          narrative: `Reversal of ${leg.referenceNumber ?? leg.id.slice(0, 8)}: ${reason.trim()}`,
          sourceType: "reversal",
          sourceId: leg.id,
          invoiceId: leg.invoiceId,
          requisitionId: leg.requisitionId,
          intakeId: leg.intakeId,
          transferGroupId: reversalGroupId,
          counterpartyClientId: leg.counterpartyClientId,
          reversalOfId: leg.id,
          reversalReason: reason.trim(),
          createdBy: actor.id,
        })
        .returning();
      await db
        .update(trustLedgerEntries)
        .set({ reversedById: contra!.id, reversalReason: reason.trim() })
        .where(and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.id, leg.id)));
      await reverseTrustLedgerGl(firmId, actor.id, leg.id, contra!.id);
      contras.push(contra!);
    }
    return { original: legs, reversals: contras };
  });
}

/** Client portions held in vault (non-zero balances on vault accounts). */
export async function listVaultClientBalances(
  firmId: string,
  vaultAccountId: string,
): Promise<
  Array<{
    clientId: string;
    clientName: string;
    currency: string;
    balanceCents: number;
  }>
> {
  const db = getDb();
  const rows = await db
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
      and(
        eq(trustLedgerEntries.firmId, firmId),
        eq(trustLedgerEntries.trustAccountId, vaultAccountId),
        isNotNull(trustLedgerEntries.clientId),
      ),
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

  return rows
    .map((row) => ({
      clientId: row.clientId!,
      clientName: clientDisplayName({
        clientType: row.clientType,
        fullName: row.clientFullName,
        legalName: row.clientLegalName,
        tradingName: row.clientTradingName,
      }),
      currency: row.currency,
      balanceCents: Number(row.balanceCents) || 0,
    }))
    .filter((row) => row.balanceCents !== 0);
}

/** Move client-tagged cash from vault to master trust bank (ledger transfer + audit row). */
export async function bankVaultCash(
  firmId: string,
  userId: string,
  input: VaultBankInInput,
) {
  const vault = await getTrustAccount(firmId, input.vaultAccountId);
  const bank = await getTrustAccount(firmId, input.bankAccountId);
  if (!vault || !vault.isActive) {
    throw new AuthError("validation", "Vault trust account not found or inactive.");
  }
  if (vault.accountKind !== "vault") {
    throw new AuthError("validation", "Source account must be a vault (cash) trust account.");
  }
  if (!bank || !bank.isActive) {
    throw new AuthError("validation", "Bank trust account not found or inactive.");
  }
  if (bank.accountKind !== "bank") {
    throw new AuthError("validation", "Destination must be a bank trust account.");
  }

  const narrative =
    input.narrative?.trim() ||
    "Vault cash banked into master trust bank";

  return runInTransaction(async () => {
    const transferResult = await postTrustLedgerEntry(firmId, userId, {
      trustAccountId: input.vaultAccountId,
      transferToAccountId: input.bankAccountId,
      clientId: input.clientId,
      matterId: input.matterId,
      entryType: "transfer",
      amountCents: input.amountCents,
      currency: input.currency || vault.currency,
      occurredAt: input.occurredAt,
      reference: input.reference,
      referenceNumber: null,
      narrative,
      adjustmentCredit: true,
      allowNegative: input.allowNegative,
      overrideReason: input.overrideReason ?? null,
      authorisedBy: input.authorisedBy ?? null,
      sourceType: "vault_bank_in",
    });

    const db = getDb();
    const bankInRows = await db
      .insert(trustVaultBankIns)
      .values({
        firmId,
        vaultAccountId: input.vaultAccountId,
        bankAccountId: input.bankAccountId,
        clientId: input.clientId,
        amountCents: input.amountCents,
        currency: input.currency || vault.currency,
        occurredAt: input.occurredAt,
        reference: input.reference,
        narrative,
        createdBy: userId,
      })
      .returning();

    return { bankIn: bankInRows[0]!, entries: transferResult.entries };
  });
}

export async function recordVaultCount(
  firmId: string,
  userId: string,
  input: VaultCountInput,
) {
  const vault = await getTrustAccount(firmId, input.vaultAccountId);
  if (!vault || vault.accountKind !== "vault") {
    throw new AuthError("validation", "Vault trust account not found.");
  }

  const systemBalanceCents = await getTrustAccountBalance(firmId, input.vaultAccountId);
  const varianceCents = input.countedBalanceCents - systemBalanceCents;

  const db = getDb();
  const rows = await db
    .insert(trustVaultCounts)
    .values({
      firmId,
      vaultAccountId: input.vaultAccountId,
      countedAt: input.countedAt,
      systemBalanceCents,
      countedBalanceCents: input.countedBalanceCents,
      varianceCents,
      notes: input.notes,
      createdBy: userId,
    })
    .returning();

  return {
    count: rows[0]!,
    systemBalanceCents,
    varianceCents,
  };
}

export async function listVaultBankIns(firmId: string, vaultAccountId?: string) {
  const db = getDb();
  const bankAccounts = alias(trustAccounts, "bank_acct");
  const conditions = [eq(trustVaultBankIns.firmId, firmId)];
  if (vaultAccountId) {
    conditions.push(eq(trustVaultBankIns.vaultAccountId, vaultAccountId));
  }
  return db
    .select({
      row: trustVaultBankIns,
      vaultName: trustAccounts.name,
      bankName: bankAccounts.name,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(trustVaultBankIns)
    .innerJoin(
      trustAccounts,
      and(
        eq(trustAccounts.id, trustVaultBankIns.vaultAccountId),
        eq(trustAccounts.firmId, firmId),
      ),
    )
    .innerJoin(
      bankAccounts,
      and(
        eq(bankAccounts.id, trustVaultBankIns.bankAccountId),
        eq(bankAccounts.firmId, firmId),
      ),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, trustVaultBankIns.clientId), eq(clients.firmId, firmId)),
    )
    .where(and(...conditions))
    .orderBy(desc(trustVaultBankIns.occurredAt))
    .limit(50);
}

export async function listVaultCounts(firmId: string, vaultAccountId?: string) {
  const db = getDb();
  const conditions = [eq(trustVaultCounts.firmId, firmId)];
  if (vaultAccountId) {
    conditions.push(eq(trustVaultCounts.vaultAccountId, vaultAccountId));
  }
  return db
    .select({
      row: trustVaultCounts,
      vaultName: trustAccounts.name,
    })
    .from(trustVaultCounts)
    .innerJoin(
      trustAccounts,
      and(
        eq(trustAccounts.id, trustVaultCounts.vaultAccountId),
        eq(trustAccounts.firmId, firmId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(trustVaultCounts.countedAt))
    .limit(50);
}
