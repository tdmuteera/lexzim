import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { disbursements, glJournalEntries, matters } from "@/lib/db/schema";
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

/** Client cost advance: Dr 1320, Cr cash or trust bank when disbursement recorded. */
export async function postDisbursementGl(
  firmId: string,
  userId: string,
  disbursementId: string,
) {
  const existing = await findPostedJournal(firmId, "expense", `disb-${disbursementId}`);
  if (existing) return existing;

  const db = getDb();
  const rows = await db
    .select({
      disbursement: disbursements,
      clientId: matters.clientId,
    })
    .from(disbursements)
    .innerJoin(matters, eq(matters.id, disbursements.matterId))
    .where(and(eq(disbursements.firmId, firmId), eq(disbursements.id, disbursementId)))
    .limit(1);
  const row = rows[0];
  if (!row || !row.disbursement.billable) return null;

  const advances = await ensureGlAccountByCode(firmId, "1320");
  const creditAccount =
    row.disbursement.paidFrom === "trust"
      ? await ensureGlAccountByCode(firmId, "1210")
      : await ensureGlAccountByCode(firmId, "1010");

  const entry = await postManualJournal(
    firmId,
    userId,
    {
      entryDate: row.disbursement.incurredAt,
      reference: row.disbursement.description.slice(0, 40),
      memo: `Client cost advance: ${row.disbursement.description}`,
      lines: [
        {
          accountId: advances.id,
          debitCents: row.disbursement.amountCents,
          creditCents: 0,
          matterId: row.disbursement.matterId,
          clientId: row.clientId,
          currency: row.disbursement.currency,
        },
        {
          accountId: creditAccount.id,
          debitCents: 0,
          creditCents: row.disbursement.amountCents,
          matterId: row.disbursement.matterId,
          clientId: row.clientId,
          currency: row.disbursement.currency,
        },
      ],
    },
    "expense",
    `disb-${disbursementId}`,
  );

  await db
    .update(disbursements)
    .set({ glPostedAt: new Date() })
    .where(and(eq(disbursements.firmId, firmId), eq(disbursements.id, disbursementId)));

  return entry;
}
