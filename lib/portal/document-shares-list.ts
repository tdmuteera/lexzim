/**
 * List document portal shares for a matter (staff).
 */
import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documentPortalShares, documents } from "@/lib/db/schema";

export async function listDocumentPortalSharesForMatter(
  firmId: string,
  matterId: string,
  opts?: { activeOnly?: boolean },
) {
  const db = getDb();
  const conditions = [
    eq(documentPortalShares.firmId, firmId),
    eq(documentPortalShares.matterId, matterId),
  ];
  if (opts?.activeOnly !== false) {
    conditions.push(isNull(documentPortalShares.revokedAt));
  }

  return db
    .select({
      id: documentPortalShares.id,
      clientId: documentPortalShares.clientId,
      documentId: documentPortalShares.documentId,
      permission: documentPortalShares.permission,
      sharedAt: documentPortalShares.sharedAt,
      revokedAt: documentPortalShares.revokedAt,
      documentTitle: documents.title,
      fileName: documents.fileName,
    })
    .from(documentPortalShares)
    .innerJoin(documents, eq(documentPortalShares.documentId, documents.id))
    .where(and(...conditions));
}
