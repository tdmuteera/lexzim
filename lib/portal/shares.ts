/**
 * Portal share grants (P5-04). Share-nothing default: no rows ⇒ no portal visibility.
 */
import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  clients,
  documentPortalShares,
  documents,
  matterPortalShares,
  matters,
} from "@/lib/db/schema";

export type PortalSharePermission = "read" | "read_upload";

export function parseSharePermission(raw: unknown): PortalSharePermission {
  if (raw === "read_upload" || raw === "upload") return "read_upload";
  if (raw === undefined || raw === null || raw === "" || raw === "read") return "read";
  throw new AuthError("validation", "permission must be read or read_upload.");
}

export function isShareActive(revokedAt: Date | null | undefined): boolean {
  return !revokedAt;
}

async function assertMatterBelongsToClient(
  firmId: string,
  matterId: string,
  clientId: string,
) {
  const db = getDb();
  const rows = await db
    .select({ id: matters.id, clientId: matters.clientId })
    .from(matters)
    .where(and(eq(matters.id, matterId), eq(matters.firmId, firmId)))
    .limit(1);
  const matter = rows[0];
  if (!matter) throw new AuthError("not_found", "Matter not found in this firm.");
  if (matter.clientId !== clientId) {
    throw new AuthError(
      "validation",
      "Matter does not belong to the selected client. Portal shares must match the matter’s client.",
    );
  }
}

async function assertClientInFirm(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: clients.id, archivedAt: clients.archivedAt })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.firmId, firmId)))
    .limit(1);
  if (!rows[0] || rows[0].archivedAt) {
    throw new AuthError("not_found", "Client not found in this firm.");
  }
}

export async function upsertMatterPortalShare(input: {
  firmId: string;
  clientId: string;
  matterId: string;
  permission?: PortalSharePermission;
  sharedByUserId: string;
  notes?: string | null;
}) {
  await assertClientInFirm(input.firmId, input.clientId);
  await assertMatterBelongsToClient(input.firmId, input.matterId, input.clientId);
  const permission = input.permission ?? "read";
  const db = getDb();

  const existing = await db
    .select()
    .from(matterPortalShares)
    .where(
      and(
        eq(matterPortalShares.firmId, input.firmId),
        eq(matterPortalShares.matterId, input.matterId),
        eq(matterPortalShares.clientId, input.clientId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const rows = await db
      .update(matterPortalShares)
      .set({
        permission,
        notes: input.notes ?? existing[0].notes,
        sharedByUserId: input.sharedByUserId,
        sharedAt: new Date(),
        revokedAt: null,
        revokedByUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(matterPortalShares.id, existing[0].id))
      .returning();
    return rows[0];
  }

  const rows = await db
    .insert(matterPortalShares)
    .values({
      firmId: input.firmId,
      clientId: input.clientId,
      matterId: input.matterId,
      permission,
      sharedByUserId: input.sharedByUserId,
      notes: input.notes ?? null,
    })
    .returning();
  return rows[0];
}

export async function revokeMatterPortalShare(input: {
  firmId: string;
  shareId: string;
  revokedByUserId: string;
}) {
  const db = getDb();
  const rows = await db
    .update(matterPortalShares)
    .set({
      revokedAt: new Date(),
      revokedByUserId: input.revokedByUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(matterPortalShares.id, input.shareId),
        eq(matterPortalShares.firmId, input.firmId),
        isNull(matterPortalShares.revokedAt),
      ),
    )
    .returning();
  if (!rows[0]) throw new AuthError("not_found", "Active matter share not found.");
  return rows[0];
}

export async function upsertDocumentPortalShare(input: {
  firmId: string;
  clientId: string;
  documentId: string;
  permission?: PortalSharePermission;
  sharedByUserId: string;
  notes?: string | null;
}) {
  await assertClientInFirm(input.firmId, input.clientId);
  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, input.documentId), eq(documents.firmId, input.firmId)))
    .limit(1);
  const doc = docs[0];
  if (!doc) throw new AuthError("not_found", "Document not found in this firm.");
  if (!doc.matterId) {
    throw new AuthError(
      "validation",
      "Only matter documents can be shared on the client portal.",
    );
  }

  await assertMatterBelongsToClient(input.firmId, doc.matterId, input.clientId);
  const permission = input.permission ?? "read";

  const existing = await db
    .select()
    .from(documentPortalShares)
    .where(
      and(
        eq(documentPortalShares.firmId, input.firmId),
        eq(documentPortalShares.documentId, input.documentId),
        eq(documentPortalShares.clientId, input.clientId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const rows = await db
      .update(documentPortalShares)
      .set({
        permission,
        matterId: doc.matterId,
        notes: input.notes ?? existing[0].notes,
        sharedByUserId: input.sharedByUserId,
        sharedAt: new Date(),
        revokedAt: null,
        revokedByUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(documentPortalShares.id, existing[0].id))
      .returning();
    return rows[0];
  }

  const rows = await db
    .insert(documentPortalShares)
    .values({
      firmId: input.firmId,
      clientId: input.clientId,
      matterId: doc.matterId,
      documentId: input.documentId,
      permission,
      sharedByUserId: input.sharedByUserId,
      notes: input.notes ?? null,
    })
    .returning();
  return rows[0];
}

export async function revokeDocumentPortalShare(input: {
  firmId: string;
  shareId: string;
  revokedByUserId: string;
}) {
  const db = getDb();
  const rows = await db
    .update(documentPortalShares)
    .set({
      revokedAt: new Date(),
      revokedByUserId: input.revokedByUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentPortalShares.id, input.shareId),
        eq(documentPortalShares.firmId, input.firmId),
        isNull(documentPortalShares.revokedAt),
      ),
    )
    .returning();
  if (!rows[0]) throw new AuthError("not_found", "Active document share not found.");
  return rows[0];
}

/** Staff: list shares for a firm (optional filters). */
export async function listMatterPortalSharesForFirm(
  firmId: string,
  opts?: { clientId?: string; matterId?: string; activeOnly?: boolean },
) {
  const db = getDb();
  const conditions = [eq(matterPortalShares.firmId, firmId)];
  if (opts?.clientId) conditions.push(eq(matterPortalShares.clientId, opts.clientId));
  if (opts?.matterId) conditions.push(eq(matterPortalShares.matterId, opts.matterId));
  if (opts?.activeOnly !== false) conditions.push(isNull(matterPortalShares.revokedAt));

  return db
    .select({
      id: matterPortalShares.id,
      clientId: matterPortalShares.clientId,
      matterId: matterPortalShares.matterId,
      permission: matterPortalShares.permission,
      sharedAt: matterPortalShares.sharedAt,
      revokedAt: matterPortalShares.revokedAt,
      notes: matterPortalShares.notes,
      matterTitle: matters.title,
      matterStatus: matters.status,
    })
    .from(matterPortalShares)
    .innerJoin(matters, eq(matterPortalShares.matterId, matters.id))
    .where(and(...conditions));
}

/**
 * Portal session query: only active shares for this firm_id + client_id.
 * Never trust client-supplied firm id.
 */
export async function listPortalVisibleMatters(firmId: string, clientId: string) {
  const db = getDb();
  return db
    .select({
      shareId: matterPortalShares.id,
      permission: matterPortalShares.permission,
      sharedAt: matterPortalShares.sharedAt,
      matterId: matters.id,
      title: matters.title,
      status: matters.status,
      areaOfLaw: matters.areaOfLaw,
      nextHearingAt: matters.nextHearingAt,
      matterNumber: matters.matterNumber,
    })
    .from(matterPortalShares)
    .innerJoin(matters, eq(matterPortalShares.matterId, matters.id))
    .where(
      and(
        eq(matterPortalShares.firmId, firmId),
        eq(matterPortalShares.clientId, clientId),
        isNull(matterPortalShares.revokedAt),
        eq(matters.firmId, firmId),
        eq(matters.clientId, clientId),
      ),
    );
}

export async function listPortalVisibleDocuments(firmId: string, clientId: string) {
  const db = getDb();
  return db
    .select({
      shareId: documentPortalShares.id,
      permission: documentPortalShares.permission,
      sharedAt: documentPortalShares.sharedAt,
      documentId: documents.id,
      title: documents.title,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      matterId: documents.matterId,
      sizeBytes: documents.sizeBytes,
    })
    .from(documentPortalShares)
    .innerJoin(documents, eq(documentPortalShares.documentId, documents.id))
    .where(
      and(
        eq(documentPortalShares.firmId, firmId),
        eq(documentPortalShares.clientId, clientId),
        isNull(documentPortalShares.revokedAt),
        eq(documents.firmId, firmId),
      ),
    );
}

/** True if portal user may read this document (active document share). */
export async function portalCanReadDocument(
  firmId: string,
  clientId: string,
  documentId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: documentPortalShares.id })
    .from(documentPortalShares)
    .where(
      and(
        eq(documentPortalShares.firmId, firmId),
        eq(documentPortalShares.clientId, clientId),
        eq(documentPortalShares.documentId, documentId),
        isNull(documentPortalShares.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

/** Active matter share with read_upload permission for this portal client. */
export async function portalCanUploadToMatter(
  firmId: string,
  clientId: string,
  matterId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: matterPortalShares.id, permission: matterPortalShares.permission })
    .from(matterPortalShares)
    .where(
      and(
        eq(matterPortalShares.firmId, firmId),
        eq(matterPortalShares.clientId, clientId),
        eq(matterPortalShares.matterId, matterId),
        isNull(matterPortalShares.revokedAt),
      ),
    )
    .limit(1);
  return rows[0]?.permission === "read_upload";
}
