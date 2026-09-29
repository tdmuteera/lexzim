import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { glJournalEntries, trustLedgerEntries } from "@/lib/db/schema";
import { ensureGlAccountByCode } from "@/lib/gl/accounts";
import { postManualJournal } from "@/lib/gl/journals";

async function findPostedJournal(
  firmId: string,
  sourceType: string,
  sourceId: string,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(glJournalEntries)
    .where(
      and(
        eq(glJournalEntries.firmId, firmId),
        eq(glJournalEntries.sourceType, sourceType),
        eq(glJournalEntries.sourceId, sourceId),
        isNull(glJournalEntries.reversedByEntryId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Mirror a client-balance-changing trust row to GL (1210 / 2100). Idempotent per ledger entry.
 * Positive rows (receipts, credit adjustments, contras of debits) Dr 1210 Cr 2100; negative rows reverse.
 * Transfers move money between trust locations or clients and leave 1210 and 2100 unchanged.
 */
export async function postTrustLedgerGl(
  firmId: string,
  userId: string,
  ledgerEntryId: string,
) {
  const existing = await findPostedJournal(firmId, "trust", ledgerEntryId);
  if (existing) return existing;

  const db = getDb();
  const rows = await db
    .select()
    .from(trustLedgerEntries)
    .where(and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.id, ledgerEntryId)))
    .limit(1);
  const entry = rows[0];
  if (!entry) return null;
  if (entry.entryType === "transfer") return null;

  const abs = Math.abs(entry.amountCents);
  if (abs === 0) return null;

  const trustBank = await ensureGlAccountByCode(firmId, "1210");
  const trustLiability = await ensureGlAccountByCode(firmId, "2100");
  const ref = entry.referenceNumber ?? entry.reference ?? entry.id.slice(0, 8);
  const memo = `${entry.reversalOfId ? "reversal" : entry.entryType} ${ref}`;
  const increase = entry.amountCents > 0;
  const common = {
    clientId: entry.clientId,
    matterId: entry.matterId,
    currency: entry.currency,
  };

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: entry.occurredAt,
      reference: ref,
      memo,
      lines: [
        {
          accountId: trustBank.id,
          debitCents: increase ? abs : 0,
          creditCents: increase ? 0 : abs,
          lineMemo: entry.narrative ?? undefined,
          ...common,
        },
        {
          accountId: trustLiability.id,
          debitCents: increase ? 0 : abs,
          creditCents: increase ? abs : 0,
          ...common,
        },
      ],
    },
    "trust",
    ledgerEntryId,
  );
}

/** Post the contra row's GL and link the original journal to it. */
export async function reverseTrustLedgerGl(
  firmId: string,
  userId: string,
  originalEntryId: string,
  contraEntryId: string,
) {
  const original = await findPostedJournal(firmId, "trust", originalEntryId);
  const contra = await postTrustLedgerGl(firmId, userId, contraEntryId);
  if (original && contra) {
    await getDb()
      .update(glJournalEntries)
      .set({ reversedByEntryId: contra.id })
      .where(and(eq(glJournalEntries.firmId, firmId), eq(glJournalEntries.id, original.id)));
  }
  return contra;
}
