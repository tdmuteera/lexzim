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

/** Mirror trust receipt/disbursement to GL (1210 / 2100). Idempotent per ledger entry. */
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

  if (entry.entryType !== "receipt" && entry.entryType !== "disbursement") {
    return null;
  }

  const trustBank = await ensureGlAccountByCode(firmId, "1210");
  const trustLiability = await ensureGlAccountByCode(firmId, "2100");
  const abs = Math.abs(entry.amountCents);
  if (abs === 0) return null;

  const ref = entry.referenceNumber ?? entry.reference ?? entry.id.slice(0, 8);
  const memo = `${entry.entryType} ${ref}`;

  if (entry.entryType === "receipt") {
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
            debitCents: abs,
            creditCents: 0,
            clientId: entry.clientId,
            matterId: entry.matterId,
            currency: entry.currency,
            lineMemo: entry.narrative ?? undefined,
          },
          {
            accountId: trustLiability.id,
            debitCents: 0,
            creditCents: abs,
            clientId: entry.clientId,
            matterId: entry.matterId,
            currency: entry.currency,
          },
        ],
      },
      "trust",
      ledgerEntryId,
    );
  }

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: entry.occurredAt,
      reference: ref,
      memo,
      lines: [
        {
          accountId: trustLiability.id,
          debitCents: abs,
          creditCents: 0,
          clientId: entry.clientId,
          matterId: entry.matterId,
          currency: entry.currency,
        },
        {
          accountId: trustBank.id,
          debitCents: 0,
          creditCents: abs,
          clientId: entry.clientId,
          matterId: entry.matterId,
          currency: entry.currency,
          lineMemo: entry.narrative ?? undefined,
        },
      ],
    },
    "trust",
    ledgerEntryId,
  );
}
