/**
 * Related parties repository (P1-06).
 */
import { and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, matterTeam, matters, relatedParties } from "@/lib/db/schema";
import { clientDisplayName } from "@/lib/clients/display";
import type { PartyInput } from "@/lib/parties/validation";

export type PartyListRow = typeof relatedParties.$inferSelect & {
  matterTitle: string | null;
  clientDisplayName: string | null;
};

function valuesFromInput(input: PartyInput) {
  return {
    partyRole: input.partyRole,
    name: input.name,
    contact: input.contact ?? null,
    notes: input.notes ?? null,
    clientId: input.clientId ?? null,
    matterId: input.matterId ?? null,
  };
}

export async function listPartiesForMatter(firmId: string, matterId: string) {
  const db = getDb();
  const rows = await db
    .select({
      party: relatedParties,
      matterTitle: matters.title,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(relatedParties)
    .leftJoin(
      matters,
      and(eq(matters.id, relatedParties.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(clients, eq(clients.id, relatedParties.clientId))
    .where(and(eq(relatedParties.firmId, firmId), eq(relatedParties.matterId, matterId)))
    .orderBy(asc(relatedParties.name));

  return rows.map((row) => ({
    ...row.party,
    matterTitle: row.matterTitle ?? null,
    clientDisplayName: row.clientType
      ? clientDisplayName({
          clientType: row.clientType,
          fullName: row.clientFullName,
          legalName: row.clientLegalName,
          tradingName: row.clientTradingName,
        })
      : null,
  }));
}

export async function listPartiesForClient(
  firmId: string,
  clientId: string,
  opts?: { viewAll?: boolean; userId?: string },
) {
  const db = getDb();
  const conditions = [
    eq(relatedParties.firmId, firmId),
    eq(relatedParties.clientId, clientId),
  ];

  if (opts?.viewAll === false) {
    if (!opts.userId) return [];
    conditions.push(
      or(
        isNull(relatedParties.matterId),
        assignedMatterAccessCondition(firmId, opts.userId),
      )!,
    );
  }

  const rows = await db
    .select({
      party: relatedParties,
      matterTitle: matters.title,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(relatedParties)
    .leftJoin(
      matters,
      and(eq(matters.id, relatedParties.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(clients, eq(clients.id, relatedParties.clientId))
    .where(and(...conditions))
    .orderBy(asc(relatedParties.name));

  return rows.map((row) => ({
    ...row.party,
    matterTitle: row.matterTitle ?? null,
    clientDisplayName: row.clientType
      ? clientDisplayName({
          clientType: row.clientType,
          fullName: row.clientFullName,
          legalName: row.clientLegalName,
          tradingName: row.clientTradingName,
        })
      : null,
  }));
}

function assignedMatterAccessCondition(
  firmId: string,
  userId: string,
) {
  const db = getDb();
  const teamMatterIds = db
    .select({ matterId: matterTeam.matterId })
    .from(matterTeam)
    .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, userId)));

  return or(
    eq(matters.responsibleLawyerId, userId),
    inArray(matters.id, teamMatterIds),
  )!;
}

/**
 * When viewAll is false, only return client-level parties (no matter)
 * or parties on matters the user can access.
 */
export async function searchParties(
  firmId: string,
  opts?: {
    q?: string;
    partyRole?: string;
    limit?: number;
    viewAll?: boolean;
    userId?: string;
  },
) {
  const db = getDb();
  const conditions = [eq(relatedParties.firmId, firmId)];
  if (opts?.partyRole) conditions.push(eq(relatedParties.partyRole, opts.partyRole));
  if (opts?.q?.trim()) {
    const pattern = `%${opts.q.trim()}%`;
    conditions.push(
      or(ilike(relatedParties.name, pattern), ilike(relatedParties.contact, pattern))!,
    );
  }

  if (opts?.viewAll === false) {
    if (!opts.userId) return [];
    conditions.push(
      or(
        isNull(relatedParties.matterId),
        assignedMatterAccessCondition(firmId, opts.userId),
      )!,
    );
  }

  const rows = await db
    .select({
      party: relatedParties,
      matterTitle: matters.title,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(relatedParties)
    .leftJoin(
      matters,
      and(eq(matters.id, relatedParties.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(clients, eq(clients.id, relatedParties.clientId))
    .where(and(...conditions))
    .orderBy(asc(relatedParties.name))
    .limit(opts?.limit ?? 50);

  return rows.map((row) => ({
    ...row.party,
    matterTitle: row.matterTitle ?? null,
    clientDisplayName: row.clientType
      ? clientDisplayName({
          clientType: row.clientType,
          fullName: row.clientFullName,
          legalName: row.clientLegalName,
          tradingName: row.clientTradingName,
        })
      : null,
  }));
}

export async function getPartyById(firmId: string, partyId: string) {
  const db = getDb();
  const rows = await db
    .select({
      party: relatedParties,
      matterTitle: matters.title,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
    })
    .from(relatedParties)
    .leftJoin(
      matters,
      and(eq(matters.id, relatedParties.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(clients, eq(clients.id, relatedParties.clientId))
    .where(and(eq(relatedParties.firmId, firmId), eq(relatedParties.id, partyId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row.party,
    matterTitle: row.matterTitle ?? null,
    clientDisplayName: row.clientType
      ? clientDisplayName({
          clientType: row.clientType,
          fullName: row.clientFullName,
          legalName: row.clientLegalName,
          tradingName: row.clientTradingName,
        })
      : null,
  };
}

export async function createParty(firmId: string, input: PartyInput) {
  const db = getDb();
  const rows = await db
    .insert(relatedParties)
    .values({
      firmId,
      ...valuesFromInput(input),
    })
    .returning();
  return rows[0];
}

export async function updateParty(firmId: string, partyId: string, input: PartyInput) {
  const db = getDb();
  const rows = await db
    .update(relatedParties)
    .set(valuesFromInput(input))
    .where(and(eq(relatedParties.firmId, firmId), eq(relatedParties.id, partyId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteParty(firmId: string, partyId: string) {
  const db = getDb();
  const rows = await db
    .delete(relatedParties)
    .where(and(eq(relatedParties.firmId, firmId), eq(relatedParties.id, partyId)))
    .returning();
  return rows[0] ?? null;
}

/** Keep legacy stub name. */
export async function listRelatedParties(firmId: string, matterId: string) {
  return listPartiesForMatter(firmId, matterId);
}
