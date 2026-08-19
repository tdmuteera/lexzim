/**
 * Matter documents repository (P1-07).
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, users } from "@/lib/db/schema";

export type DocumentListRow = typeof documents.$inferSelect & {
  createdByName: string | null;
};

export async function listDocumentsForClient(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select({
      document: documents,
      createdByName: users.fullName,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .where(and(eq(documents.firmId, firmId), eq(documents.clientId, clientId)))
    .orderBy(desc(documents.createdAt));

  return rows.map((row) => ({
    ...row.document,
    createdByName: row.createdByName ?? null,
  }));
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
