/**
 * Client repository (P1-01 stubs + P1-02 CRUD).
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
import type { ClientInput } from "@/lib/clients/validation";

export type ListClientsOpts = {
  q?: string;
  clientType?: "individual" | "company";
  archived?: "active" | "archived" | "all";
  sort?: "name" | "created" | "updated";
  sortDir?: "asc" | "desc";
};

function clientValuesFromInput(input: ClientInput) {
  return {
    clientType: input.clientType,
    fullName: input.clientType === "individual" ? input.fullName : input.fullName ?? null,
    legalName: input.clientType === "company" ? input.legalName : input.legalName ?? null,
    tradingName: input.tradingName,
    nationalIdOrRegNumber: input.nationalIdOrRegNumber,
    taxNumber: input.taxNumber,
    email: input.email,
    phone: input.phone,
    altPhone: input.altPhone,
    physicalAddress: input.physicalAddress,
    postalAddress: input.postalAddress,
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
        ilike(clients.fullName, pattern),
        ilike(clients.legalName, pattern),
        ilike(clients.tradingName, pattern),
        ilike(clients.nationalIdOrRegNumber, pattern),
        ilike(clients.phone, pattern),
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
        : clients.fullName;

  return db
    .select()
    .from(clients)
    .where(and(...conditions))
    .orderBy(orderFn(orderCol), orderFn(clients.legalName));
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
  const rows = await db
    .insert(clients)
    .values({
      firmId,
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
