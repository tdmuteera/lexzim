/**
 * Trust ledger stubs (P3-01).
 * NEVER mix trust balances with fee_payments.
 * EVERY firm-scoped query MUST filter firmId.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { trustAccounts, trustLedgerEntries } from "@/lib/db/schema";

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

export async function listTrustLedger(
  firmId: string,
  opts?: { trustAccountId?: string; matterId?: string },
) {
  const db = getDb();
  const conditions = [eq(trustLedgerEntries.firmId, firmId)];
  if (opts?.trustAccountId) {
    conditions.push(eq(trustLedgerEntries.trustAccountId, opts.trustAccountId));
  }
  if (opts?.matterId) {
    conditions.push(eq(trustLedgerEntries.matterId, opts.matterId));
  }
  return db
    .select()
    .from(trustLedgerEntries)
    .where(and(...conditions))
    .orderBy(desc(trustLedgerEntries.occurredAt));
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
