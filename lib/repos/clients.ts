/**
 * Client repository (P1-02 + P7-04 KYC).
 * EVERY query MUST filter by firmId from session.
 */
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { allocateClientNumber } from "@/lib/clients/client-number";
import type { ClientInput } from "@/lib/clients/validation";

export type ListClientsOpts = {
  q?: string;
  clientType?: string;
  archived?: "active" | "archived" | "all";
  sort?: "name" | "created" | "updated" | "number";
  sortDir?: "asc" | "desc";
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
  const rows = await db
    .insert(clients)
    .values({
      firmId,
      clientNumber,
      createdBy: userId,
      ...clientValuesFromInput(input),
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
