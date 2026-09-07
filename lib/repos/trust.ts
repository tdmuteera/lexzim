/**
 * Trust ledger (P3-08). NEVER mix with fee_payments.
 * EVERY firm-scoped query MUST filter firmId.
 * amount_cents is signed: credit (+) increases client trust liability held.
 */
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import { clients, matters, trustAccounts, trustLedgerEntries, trustVaultBankIns, trustVaultCounts } from "@/lib/db/schema";
import {
  signedTrustAmount,
  type TrustAccountInput,
  type TrustLedgerInput,
} from "@/lib/trust/validation";
import type { VaultBankInInput, VaultCountInput } from "@/lib/trust/vault-validation";
import { allocateTrustReferenceNumber } from "@/lib/repos/firm-settings";
import { postTrustLedgerGl } from "@/lib/gl/posting-trust";

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
        select sum(${trustLedgerEntries.amountCents}) from ${trustLedgerEntries}
        where ${trustLedgerEntries.firmId} = ${firmId}
          and ${trustLedgerEntries.trustAccountId} = ${trustAccounts.id}
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

export async function postTrustLedgerEntry(
  firmId: string,
  userId: string,
  input: TrustLedgerInput,
) {
  const account = await getTrustAccount(firmId, input.trustAccountId);
  if (!account || !account.isActive) {
    throw new AuthError("validation", "Active trust account not found.");
  }

  if (input.entryType === "transfer") {
    return postTransfer(firmId, userId, input, account.currency);
  }

  const signed = signedTrustAmount(
    input.entryType,
    input.amountCents,
    input.adjustmentCredit,
  );

  if (input.clientId && signed < 0 && !input.allowNegative) {
    const bal = await getClientTrustBalance(firmId, input.clientId, {
      trustAccountId: input.trustAccountId,
    });
    if (bal + signed < 0) {
      throw new AuthError(
        "validation",
        `This would make the client trust balance negative (${bal} + ${signed}). Set allowNegative to override (audited).`,
      );
    }
  }

  const db = getDb();

  let referenceNumber = input.referenceNumber ?? input.reference;
  if (
    (input.entryType === "receipt" || input.entryType === "disbursement") &&
    !referenceNumber
  ) {
    referenceNumber = await allocateTrustReferenceNumber(firmId);
  }
  const reference = input.reference ?? referenceNumber;

  const rows = await db
    .insert(trustLedgerEntries)
    .values({
      firmId,
      trustAccountId: input.trustAccountId,
      matterId: input.matterId,
      clientId: input.clientId,
      entryType: input.entryType,
      amountCents: signed,
      currency: input.currency || account.currency,
      occurredAt: input.occurredAt,
      reference,
      referenceNumber,
      narrative: input.narrative,
      createdBy: userId,
    })
    .returning();

  if (
    (input.entryType === "receipt" || input.entryType === "disbursement") &&
    !input.skipGl
  ) {
    await postTrustLedgerGl(firmId, userId, rows[0]!.id);
  }

  return { entries: [rows[0]!] };
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

  if (input.clientId && !input.allowNegative) {
    const bal = await getClientTrustBalance(firmId, input.clientId, {
      trustAccountId: input.trustAccountId,
    });
    if (bal - input.amountCents < 0) {
      throw new AuthError(
        "validation",
        `Transfer would make the client trust balance negative on the source account. Set allowNegative to override (audited).`,
      );
    }
  }

  const narrative =
    input.narrative ||
    `Transfer ${input.amountCents} between trust accounts`;

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
      currency: input.currency || fromCurrency,
      occurredAt: input.occurredAt,
      reference: input.reference,
      narrative: `${narrative} (out)`,
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
      currency: input.currency || toAccount.currency,
      occurredAt: input.occurredAt,
      reference: input.reference,
      narrative: `${narrative} (in)`,
      createdBy: userId,
    })
    .returning();

  return { entries: [outRows[0]!, inRows[0]!] };
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
