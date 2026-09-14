/**
 * Matter documents repository (P1-07).
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, documents, matters, users } from "@/lib/db/schema";
import { clientDisplayLabel } from "@/lib/clients/display";

export type DocumentListRow = typeof documents.$inferSelect & {
  createdByName: string | null;
};

export type ClientDocumentListRow = DocumentListRow & {
  clientDisplayName: string | null;
  clientNumber: string | null;
  matterNumber?: string | null;
  matterTitle?: string | null;
};

/** All documents linked to a client (client-file and matter uploads). */
export async function listDocumentsForClient(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select({
      document: documents,
      createdByName: users.fullName,
      matterNumber: matters.matterNumber,
      matterTitle: matters.title,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .leftJoin(matters, eq(matters.id, documents.matterId))
    .where(and(eq(documents.firmId, firmId), eq(documents.clientId, clientId)))
    .orderBy(desc(documents.createdAt));

  return rows.map((row) => ({
    ...row.document,
    createdByName: row.createdByName ?? null,
    matterNumber: row.matterNumber ?? null,
    matterTitle: row.matterTitle ?? null,
  }));
}

/** Firm-wide client documents hub list (matterNumber/title joined when linked). */
export async function listClientDocumentsForFirm(firmId: string, opts?: { q?: string }) {
  const db = getDb();

  const rows = await db
    .select({
      document: documents,
      createdByName: users.fullName,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientFirstName: clients.firstName,
      clientSurname: clients.surname,
      clientLegalName: clients.legalName,
      clientRegisteredName: clients.registeredName,
      clientTradingName: clients.tradingName,
      matterNumber: matters.matterNumber,
      matterTitle: matters.title,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .leftJoin(clients, eq(clients.id, documents.clientId))
    .leftJoin(matters, eq(matters.id, documents.matterId))
    .where(eq(documents.firmId, firmId))
    .orderBy(desc(documents.createdAt));

  const q = opts?.q?.trim().toLowerCase();
  const mapped: ClientDocumentListRow[] = rows.map((row) => {
    const clientDisplayName = row.clientType
      ? clientDisplayLabel({
          clientNumber: row.clientNumber,
          clientType: row.clientType,
          fullName: row.clientFullName,
          firstName: row.clientFirstName,
          surname: row.clientSurname,
          legalName: row.clientLegalName,
          registeredName: row.clientRegisteredName,
          tradingName: row.clientTradingName,
        })
      : null;
    return {
      ...row.document,
      createdByName: row.createdByName ?? null,
      clientDisplayName,
      clientNumber: row.clientNumber ?? null,
      matterNumber: row.matterNumber ?? null,
      matterTitle: row.matterTitle ?? null,
    };
  });

  if (!q) return mapped;
  return mapped.filter((row) => {
    const hay = [
      row.title,
      row.fileName,
      row.clientDisplayName,
      row.clientNumber,
      row.matterNumber,
      row.matterTitle,
      row.docType,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export async function listDocumentsForMatter(firmId: string, matterId: string) {
  const db = getDb();
  const rows = await db
    .select({
      document: documents,
      createdByName: users.fullName,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .where(and(eq(documents.firmId, firmId), eq(documents.matterId, matterId)))
    .orderBy(desc(documents.createdAt));

  return rows.map((row) => ({
    ...row.document,
    createdByName: row.createdByName ?? null,
  }));
}

export async function getDocumentById(firmId: string, documentId: string) {
  const db = getDb();
  const rows = await db
    .select({
      document: documents,
      createdByName: users.fullName,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .where(and(eq(documents.firmId, firmId), eq(documents.id, documentId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row.document,
    createdByName: row.createdByName ?? null,
  };
}

export async function createDocumentRecord(input: {
  id: string;
  firmId: string;
  matterId: string | null;
  clientId: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  sizeBytes: number;
  docType?: string;
  templateId?: string | null;
  createdBy: string;
}) {
  const db = getDb();
  const rows = await db
    .insert(documents)
    .values({
      id: input.id,
      firmId: input.firmId,
      matterId: input.matterId,
      clientId: input.clientId,
      title: input.title,
      fileName: input.fileName,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      sizeBytes: input.sizeBytes,
      docType: input.docType ?? "uploaded",
      templateId: input.templateId ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return rows[0];
}

export async function renameDocument(
  firmId: string,
  documentId: string,
  title: string,
) {
  const db = getDb();
  const rows = await db
    .update(documents)
    .set({ title })
    .where(and(eq(documents.firmId, firmId), eq(documents.id, documentId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteDocumentRecord(firmId: string, documentId: string) {
  const db = getDb();
  const rows = await db
    .delete(documents)
    .where(and(eq(documents.firmId, firmId), eq(documents.id, documentId)))
    .returning();
  return rows[0] ?? null;
}
