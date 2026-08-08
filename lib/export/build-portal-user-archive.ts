/**
 * Portal self-export: data LexZim holds for this portal user/client view.
 * Not a full DSR against the law firm's matter file.
 */
import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  documentPortalShares,
  documents,
  matterPortalShares,
  matters,
  portalInboxUploads,
  portalUsers,
} from "@/lib/db/schema";
import type { PortalSessionUser } from "@/lib/portal/auth";

export async function buildPortalUserArchive(session: PortalSessionUser) {
  const db = getDb();
  const exportedAt = new Date().toISOString();

  const [profile] = await db
    .select({
      id: portalUsers.id,
      email: portalUsers.email,
      fullName: portalUsers.fullName,
      firmId: portalUsers.firmId,
      clientId: portalUsers.clientId,
      isActive: portalUsers.isActive,
      invitedAt: portalUsers.invitedAt,
      lastLoginAt: portalUsers.lastLoginAt,
      createdAt: portalUsers.createdAt,
    })
    .from(portalUsers)
    .where(
      and(
        eq(portalUsers.id, session.id),
        eq(portalUsers.firmId, session.firmId),
      ),
    )
    .limit(1);

  const matterShares = await db
    .select({
      shareId: matterPortalShares.id,
      permission: matterPortalShares.permission,
      sharedAt: matterPortalShares.sharedAt,
      revokedAt: matterPortalShares.revokedAt,
      matterId: matters.id,
      title: matters.title,
      status: matters.status,
      areaOfLaw: matters.areaOfLaw,
      matterNumber: matters.matterNumber,
    })
    .from(matterPortalShares)
    .innerJoin(matters, eq(matterPortalShares.matterId, matters.id))
    .where(
      and(
        eq(matterPortalShares.firmId, session.firmId),
        eq(matterPortalShares.clientId, session.clientId),
      ),
    );

  const documentShares = await db
    .select({
      shareId: documentPortalShares.id,
      permission: documentPortalShares.permission,
      sharedAt: documentPortalShares.sharedAt,
      revokedAt: documentPortalShares.revokedAt,
      documentId: documents.id,
      title: documents.title,
      fileName: documents.fileName,
      matterId: documents.matterId,
    })
    .from(documentPortalShares)
    .innerJoin(documents, eq(documentPortalShares.documentId, documents.id))
    .where(
      and(
        eq(documentPortalShares.firmId, session.firmId),
        eq(documentPortalShares.clientId, session.clientId),
      ),
    );

  const inbox = await db
    .select({
      id: portalInboxUploads.id,
      matterId: portalInboxUploads.matterId,
      title: portalInboxUploads.title,
      fileName: portalInboxUploads.fileName,
      mimeType: portalInboxUploads.mimeType,
      sizeBytes: portalInboxUploads.sizeBytes,
      status: portalInboxUploads.status,
      storagePath: portalInboxUploads.storagePath,
      createdAt: portalInboxUploads.createdAt,
    })
    .from(portalInboxUploads)
    .where(
      and(
        eq(portalInboxUploads.firmId, session.firmId),
        eq(portalInboxUploads.portalUserId, session.id),
      ),
    );

  return {
    format: "lexzim-portal-user-export",
    version: 1,
    exportedAt,
    firm: {
      id: session.firmId,
      name: session.firmName,
      slug: session.firmSlug,
    },
    client: {
      id: session.clientId,
      displayName: session.clientDisplayName,
    },
    portalUser: profile ?? {
      id: session.id,
      email: session.email,
      fullName: session.fullName,
      firmId: session.firmId,
      clientId: session.clientId,
    },
    matterShares: matterShares.map((r) => ({
      ...r,
      sharedAt: r.sharedAt.toISOString(),
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    })),
    documentShares: documentShares.map((r) => ({
      ...r,
      sharedAt: r.sharedAt.toISOString(),
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    })),
    inboxUploads: inbox.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    exclusions: [
      "Password hashes and magic-link tokens",
      "Binary file contents (storage paths only for inbox)",
      "Firm internal notes, trust ledgers, and AI conversations",
    ],
    note: "This is portal-held data only, not a full copy of the law firm's matter file.",
  };
}
