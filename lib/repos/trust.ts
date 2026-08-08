/**
 * Trust ledger (P3-08). NEVER mix with fee_payments.
 * EVERY firm-scoped query MUST filter firmId.
 * amount_cents is signed: credit (+) increases client trust liability held.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { clients, matters, trustAccounts, trustLedgerEntries } from "@/lib/db/schema";
import {
  signedTrustAmount,
  type TrustAccountInput,
  type TrustLedgerInput,
} from "@/lib/trust/validation";

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
      reference: input.reference,
      narrative: input.narrative,
      createdBy: userId,
    })
    .returning();
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
