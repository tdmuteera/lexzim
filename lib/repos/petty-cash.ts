import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { pettyCashFloats, pettyCashMovements } from "@/lib/db/schema";
import { postPettyCashMovementGl } from "@/lib/gl/posting-petty-cash";

export async function getOpenPettyCashFloat(firmId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(pettyCashFloats)
    .where(and(eq(pettyCashFloats.firmId, firmId), eq(pettyCashFloats.status, "open")))
    .orderBy(desc(pettyCashFloats.openingDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPettyCashBalance(firmId: string, floatId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      floatAmount: pettyCashFloats.amountCents,
      vaultIn: sql<number>`coalesce(sum(case when ${pettyCashMovements.movementType} = 'vault_to_petty' then ${pettyCashMovements.amountCents} else 0 end), 0)::int`,
      spend: sql<number>`coalesce(sum(case when ${pettyCashMovements.movementType} = 'petty_spend' then ${pettyCashMovements.amountCents} else 0 end), 0)::int`,
      returned: sql<number>`coalesce(sum(case when ${pettyCashMovements.movementType} = 'petty_return' then ${pettyCashMovements.amountCents} else 0 end), 0)::int`,
    })
    .from(pettyCashFloats)
    .leftJoin(pettyCashMovements, eq(pettyCashMovements.floatId, pettyCashFloats.id))
    .where(and(eq(pettyCashFloats.firmId, firmId), eq(pettyCashFloats.id, floatId)))
    .groupBy(pettyCashFloats.id, pettyCashFloats.amountCents);

  const row = rows[0];
  if (!row) return 0;
  return row.floatAmount + Number(row.vaultIn) - Number(row.spend) - Number(row.returned);
}

export async function openPettyCashFloat(
  firmId: string,
  userId: string,
  input: { openingDate: Date; amountCents: number; currency: string },
) {
  const existing = await getOpenPettyCashFloat(firmId);
  if (existing) {
    throw new AuthError("validation", "Close the current petty cash float before opening a new one.");
  }
  const db = getDb();
  const rows = await db
    .insert(pettyCashFloats)
    .values({
      firmId,
      openingDate: input.openingDate,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "open",
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function listPettyCashMovements(firmId: string, floatId: string) {
  const db = getDb();
  return db
    .select()
    .from(pettyCashMovements)
    .where(and(eq(pettyCashMovements.firmId, firmId), eq(pettyCashMovements.floatId, floatId)))
    .orderBy(desc(pettyCashMovements.movementDate));
}

export async function createPettyCashMovement(
  firmId: string,
  userId: string,
  input: {
    floatId: string;
    movementType: "vault_to_petty" | "petty_spend" | "petty_return";
    amountCents: number;
    currency: string;
    movementDate: Date;
    expenseGlAccountId?: string | null;
    reference?: string | null;
    notes?: string | null;
  },
) {
  const float = await getOpenPettyCashFloat(firmId);
  if (!float || float.id !== input.floatId) {
    throw new AuthError("validation", "Open petty cash float not found.");
  }

  const db = getDb();
  const [movement] = await db
    .insert(pettyCashMovements)
    .values({
      firmId,
      floatId: input.floatId,
      movementType: input.movementType,
      amountCents: input.amountCents,
      currency: input.currency,
      movementDate: input.movementDate,
      expenseGlAccountId: input.expenseGlAccountId ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning();

  await postPettyCashMovementGl(firmId, userId, movement!.id);
  return movement!;
}

export async function buildPettyCashSummary(firmId: string) {
  const float = await getOpenPettyCashFloat(firmId);
  if (!float) {
    return { float: null, balanceCents: 0, movements: [] as typeof pettyCashMovements.$inferSelect[] };
  }
  const movements = await listPettyCashMovements(firmId, float.id);
  const balanceCents = await getPettyCashBalance(firmId, float.id);
  return { float, balanceCents, movements };
}
