import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { glJournalEntries, pettyCashMovements } from "@/lib/db/schema";
import { ensureGlAccountByCode, getGlAccount } from "@/lib/gl/accounts";
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

export async function postPettyCashMovementGl(
  firmId: string,
  userId: string,
  movementId: string,
) {
  const existing = await findPostedJournal(firmId, "expense", `petty-${movementId}`);
  if (existing) return existing;

  const db = getDb();
  const rows = await db
    .select()
    .from(pettyCashMovements)
    .where(and(eq(pettyCashMovements.firmId, firmId), eq(pettyCashMovements.id, movementId)))
    .limit(1);
  const movement = rows[0];
  if (!movement) throw new AuthError("not_found", "Petty cash movement not found.");

  const petty = await ensureGlAccountByCode(firmId, "1050");
  const vault = await ensureGlAccountByCode(firmId, "1020");
  const ref = movement.reference ?? movement.id.slice(0, 8);

  if (movement.movementType === "vault_to_petty") {
    return postManualJournal(
      firmId,
      userId,
      {
        entryDate: movement.movementDate,
        reference: ref,
        memo: "Petty cash float transfer from vault",
        lines: [
          { accountId: petty.id, debitCents: movement.amountCents, creditCents: 0, currency: movement.currency },
          { accountId: vault.id, debitCents: 0, creditCents: movement.amountCents, currency: movement.currency },
        ],
      },
      "expense",
      `petty-${movementId}`,
    );
  }

  if (movement.movementType === "petty_return") {
    return postManualJournal(
      firmId,
      userId,
      {
        entryDate: movement.movementDate,
        reference: ref,
        memo: "Petty cash return to vault",
        lines: [
          { accountId: vault.id, debitCents: movement.amountCents, creditCents: 0, currency: movement.currency },
          { accountId: petty.id, debitCents: 0, creditCents: movement.amountCents, currency: movement.currency },
        ],
      },
      "expense",
      `petty-${movementId}`,
    );
  }

  if (movement.movementType === "petty_spend") {
    if (!movement.expenseGlAccountId) {
      throw new AuthError("validation", "Expense account required for petty spend.");
    }
    const expenseAccount = await getGlAccount(firmId, movement.expenseGlAccountId);
    if (!expenseAccount) throw new AuthError("validation", "Expense GL account not found.");
    return postManualJournal(
      firmId,
      userId,
      {
        entryDate: movement.movementDate,
        reference: ref,
        memo: movement.notes ?? "Petty cash spend",
        lines: [
          {
            accountId: expenseAccount.id,
            debitCents: movement.amountCents,
            creditCents: 0,
            currency: movement.currency,
            lineMemo: movement.notes ?? undefined,
          },
          { accountId: petty.id, debitCents: 0, creditCents: movement.amountCents, currency: movement.currency },
        ],
      },
      "expense",
      `petty-${movementId}`,
    );
  }

  return null;
}
