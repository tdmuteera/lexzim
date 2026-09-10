/**
 * Client repository (P1-02 + P7-04 KYC + P11-03 visibility).
 * EVERY query MUST filter by firmId from session.
 */
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, matterTeam, matters } from "@/lib/db/schema";
import { allocateClientNumber } from "@/lib/clients/client-number";
import type { ClientInput } from "@/lib/clients/validation";

export type ListClientsOpts = {
  q?: string;
  clientType?: string;
  archived?: "active" | "archived" | "all";
  sort?: "name" | "created" | "updated" | "number";
  sortDir?: "asc" | "desc";
  /** When false, only assigned clients (responsible or matter link). */
  viewAll?: boolean;
  userId?: string;
};

function clientValuesFromInput(input: ClientInput) {
  return {
    clientType: input.clientType,
    firstName: input.firstName,
    surname: input.surname,
    otherNames: input.otherNames,
    maidenName: input.maidenName,
    dateOfBirth: input.dateOfBirth ?? null,
    nationality: input.nationality,
    idNumber: input.idNumber,
    fullName: input.fullName,
    legalName: input.legalName,
    registeredName: input.registeredName,
    tradingName: input.tradingName,
    nationalIdOrRegNumber: input.nationalIdOrRegNumber,
    regTaxNumber: input.regTaxNumber,
    taxNumber: input.taxNumber,
    incorporationDate: input.incorporationDate ?? null,
    incorporationCountry: input.incorporationCountry,
    email: input.email,
    phone: input.phone,
    whatsapp: input.whatsapp,
    altPhone: input.altPhone,
    residentialAddress: input.residentialAddress,
    registeredAddress: input.registeredAddress,
    businessAddress: input.businessAddress,
    physicalAddress: input.physicalAddress,
    postalAddress: input.postalAddress,
    occupation: input.occupation,
    employer: input.employer,
    industry: input.industry,
    responsibleLawyerId: input.responsibleLawyerId ?? null,
    pepStatus: input.pepStatus ?? false,
    pepDetails: input.pepDetails,
    uboJson: input.uboJson ?? [],
    matterScopePurpose: input.matterScopePurpose,
    sourceOfFunds: input.sourceOfFunds,
    sourceOfFundsOther: input.sourceOfFundsOther,
    kycDocumentsJson: input.kycDocumentsJson ?? {},
    declarationSignedAt: input.declarationSignedAt ?? null,
    declarationSignatory: input.declarationSignatory,
    kycStatus: input.kycStatus ?? "draft",
    kycNotes: input.kycNotes,
  };
}

/**
 * Assigned = client.responsibleLawyerId OR client.createdBy OR matter.responsibleLawyerId OR matter_team.
 */
export async function listAccessibleClientIds(
  firmId: string,
  userId: string,
): Promise<string[]> {
  const db = getDb();
  const asResponsible = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.responsibleLawyerId, userId)));

  const asCreator = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.createdBy, userId)));

  const asMatterLawyer = await db
    .selectDistinct({ id: matters.clientId })
    .from(matters)
    .where(
      and(eq(matters.firmId, firmId), eq(matters.responsibleLawyerId, userId)),
    );

  const asTeam = await db
    .selectDistinct({ id: matters.clientId })
    .from(matterTeam)
    .innerJoin(matters, eq(matters.id, matterTeam.matterId))
    .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, userId)));

  return [
    ...new Set(
      [
        ...asResponsible.map((r) => r.id),
        ...asCreator.map((r) => r.id),
        ...asMatterLawyer.map((r) => r.id).filter(Boolean),
        ...asTeam.map((r) => r.id).filter(Boolean),
      ] as string[],
    ),
  ];
}

export async function userCanAccessClient(
  firmId: string,
  clientId: string,
  userId: string,
  viewAll: boolean,
): Promise<boolean> {
  if (viewAll) {
    const row = await getClientById(firmId, clientId);
    return Boolean(row);
  }

  const row = await getClientById(firmId, clientId);
  if (!row) return false;
  if (row.responsibleLawyerId === userId) return true;
  if (row.createdBy === userId) return true;

  const db = getDb();
  const matterHit = await db
    .select({ id: matters.id })
    .from(matters)
    .where(
      and(
        eq(matters.firmId, firmId),
        eq(matters.clientId, clientId),
        eq(matters.responsibleLawyerId, userId),
      ),
    )
    .limit(1);
  if (matterHit.length) return true;

  const teamHit = await db
    .select({ id: matterTeam.userId })
    .from(matterTeam)
    .innerJoin(matters, eq(matters.id, matterTeam.matterId))
    .where(
      and(
        eq(matterTeam.firmId, firmId),
        eq(matterTeam.userId, userId),
        eq(matters.clientId, clientId),
      ),
    )
    .limit(1);

  return teamHit.length > 0;
}

export async function listClients(firmId: string, opts?: ListClientsOpts) {
  const db = getDb();
  const conditions = [eq(clients.firmId, firmId)];

  const archived = opts?.archived ?? "active";
  if (archived === "archived") {
    conditions.push(isNotNull(clients.archivedAt));
  } else if (archived !== "all") {
    conditions.push(isNull(clients.archivedAt));
  }

  if (opts?.clientType) {
    conditions.push(eq(clients.clientType, opts.clientType));
  }

  if (opts?.q?.trim()) {
    const pattern = `%${opts.q.trim()}%`;
    conditions.push(
      or(
        ilike(clients.clientNumber, pattern),
        ilike(clients.firstName, pattern),
        ilike(clients.surname, pattern),
        ilike(clients.fullName, pattern),
        ilike(clients.legalName, pattern),
        ilike(clients.registeredName, pattern),
        ilike(clients.tradingName, pattern),
        ilike(clients.idNumber, pattern),
        ilike(clients.nationalIdOrRegNumber, pattern),
        ilike(clients.phone, pattern),
        ilike(clients.whatsapp, pattern),
        ilike(clients.email, pattern),
      )!,
    );
  }

  const viewAll = opts?.viewAll !== false;
  if (!viewAll) {
    if (!opts?.userId) {
      conditions.push(sql`false`);
    } else {
      const ids = await listAccessibleClientIds(firmId, opts.userId);
      if (ids.length === 0) {
        conditions.push(sql`false`);
      } else {
        conditions.push(inArray(clients.id, ids));
      }
    }
  }

  const sortKey = opts?.sort ?? "name";
  const sortDir = opts?.sortDir ?? "asc";
  const orderFn = sortDir === "desc" ? desc : asc;
  const orderCol =
    sortKey === "created"
      ? clients.createdAt
      : sortKey === "updated"
        ? clients.updatedAt
        : sortKey === "number"
          ? clients.clientNumber
          : clients.surname;

  return db
    .select()
    .from(clients)
    .where(and(...conditions))
    .orderBy(orderFn(orderCol), orderFn(clients.firstName), orderFn(clients.clientNumber));
}

export async function getClientById(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createClient(firmId: string, userId: string, input: ClientInput) {
  const db = getDb();
  const clientNumber = await allocateClientNumber(firmId);
  const values = clientValuesFromInput(input);
  // If left unassigned, the creator stays responsible so save → open does not 404
  // under assigned-only client visibility.
  if (!values.responsibleLawyerId) {
    values.responsibleLawyerId = userId;
  }
  const rows = await db
    .insert(clients)
    .values({
      firmId,
      clientNumber,
      createdBy: userId,
      ...values,
    })
    .returning();
  return rows[0];
}

export async function updateClient(firmId: string, clientId: string, input: ClientInput) {
  const db = getDb();
  const rows = await db
    .update(clients)
    .set({
      ...clientValuesFromInput(input),
      updatedAt: new Date(),
    })
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
    .returning();
  return rows[0] ?? null;
}

export async function archiveClient(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .update(clients)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId), isNull(clients.archivedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function restoreClient(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .update(clients)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId), isNotNull(clients.archivedAt)))
    .returning();
  return rows[0] ?? null;
}
