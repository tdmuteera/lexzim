import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isPortalEnabled } from "@/lib/portal/config";
import { listDocumentPortalSharesForMatter } from "@/lib/portal/document-shares-list";
import {
  listMatterPortalSharesForFirm,
  parseSharePermission,
  revokeDocumentPortalShare,
  revokeMatterPortalShare,
  upsertDocumentPortalShare,
  upsertMatterPortalShare,
} from "@/lib/portal/shares";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function assertPortalOn() {
  if (!isPortalEnabled()) {
    throw new AuthError("portal_disabled", "Client portal is disabled.");
  }
}

/** Staff: list matter and/or document portal shares. */
export async function GET(request: Request) {
  try {
    assertPortalOn();
    const session = await requireAny(["matters.edit", "matters.create", "matters.view", "clients.edit"]);
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const matterId = url.searchParams.get("matterId") ?? undefined;
    const clientId = url.searchParams.get("clientId") ?? undefined;
    const type = url.searchParams.get("type");
    const activeOnly = url.searchParams.get("includeRevoked") !== "1";

    if (type === "document" && matterId) {
      const rows = await listDocumentPortalSharesForMatter(firmId, matterId, { activeOnly });
      return jsonOk({
        defaultShareNothing: true,
        items: rows.map((r) => ({
          id: r.id,
          type: "document" as const,
          clientId: r.clientId,
          documentId: r.documentId,
          permission: r.permission,
          sharedAt: r.sharedAt.toISOString(),
          revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
          documentTitle: r.documentTitle,
          fileName: r.fileName,
        })),
      });
    }

    const rows = await listMatterPortalSharesForFirm(firmId, {
      clientId,
      matterId,
      activeOnly,
    });
    return jsonOk({
      defaultShareNothing: true,
      items: rows.map((r) => ({
        ...r,
        type: "matter" as const,
        sharedAt: r.sharedAt.toISOString(),
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Staff: create/reactivate a share, or revoke.
 * Body share: { type: "matter"|"document", clientId, matterId?, documentId?, permission?, notes? }
 * Body revoke: { revoke: true, type, shareId }
 */
export async function POST(request: Request) {
  try {
    assertPortalOn();
    const session = await requireAny(["matters.edit", "matters.create"]);
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      revoke?: boolean;
      type?: string;
      shareId?: string;
      clientId?: string;
      matterId?: string;
      documentId?: string;
      permission?: string;
      notes?: string;
    };
    const info = clientInfo(request);

    if (body.revoke) {
      if (!body.shareId?.trim()) throw new AuthError("validation", "shareId is required.");
      if (body.type === "document") {
        const row = await revokeDocumentPortalShare({
          firmId,
          shareId: body.shareId.trim(),
          revokedByUserId: session.id,
        });
        await writeAuditLog({
          action: "portal.document_share_revoked",
          firmId,
          userId: session.id,
          entityType: "document_portal_share",
          entityId: row.id,
          metadata: {
            documentId: row.documentId,
            clientId: row.clientId,
            matterId: row.matterId,
          },
          ipOrUserAgent: info,
        });
        return jsonOk({ revoked: true, share: serializeDocShare(row) });
      }
      const row = await revokeMatterPortalShare({
        firmId,
        shareId: body.shareId.trim(),
        revokedByUserId: session.id,
      });
      await writeAuditLog({
        action: "portal.matter_share_revoked",
        firmId,
        userId: session.id,
        entityType: "matter_portal_share",
        entityId: row.id,
        metadata: { matterId: row.matterId, clientId: row.clientId },
        ipOrUserAgent: info,
      });
      return jsonOk({ revoked: true, share: serializeMatterShare(row) });
    }

    if (!body.clientId?.trim()) throw new AuthError("validation", "clientId is required.");
    const permission = parseSharePermission(body.permission);

    if (body.type === "document") {
      if (!body.documentId?.trim()) {
        throw new AuthError("validation", "documentId is required for document shares.");
      }
      const row = await upsertDocumentPortalShare({
        firmId,
        clientId: body.clientId.trim(),
        documentId: body.documentId.trim(),
        permission,
        sharedByUserId: session.id,
        notes: body.notes ?? null,
      });
      await writeAuditLog({
        action: "portal.document_shared",
        firmId,
        userId: session.id,
        entityType: "document_portal_share",
        entityId: row.id,
        metadata: {
          documentId: row.documentId,
          clientId: row.clientId,
          matterId: row.matterId,
          permission: row.permission,
        },
        ipOrUserAgent: info,
      });
      return jsonOk({ share: serializeDocShare(row) });
    }

    if (!body.matterId?.trim()) {
      throw new AuthError("validation", "matterId is required for matter shares.");
    }
    const row = await upsertMatterPortalShare({
      firmId,
      clientId: body.clientId.trim(),
      matterId: body.matterId.trim(),
      permission,
      sharedByUserId: session.id,
      notes: body.notes ?? null,
    });
    await writeAuditLog({
      action: "portal.matter_shared",
      firmId,
      userId: session.id,
      entityType: "matter_portal_share",
      entityId: row.id,
      metadata: {
        matterId: row.matterId,
        clientId: row.clientId,
        permission: row.permission,
      },
      ipOrUserAgent: info,
    });
    return jsonOk({ share: serializeMatterShare(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

function serializeMatterShare(row: {
  id: string;
  firmId: string;
  clientId: string;
  matterId: string;
  permission: string;
  sharedAt: Date;
  revokedAt: Date | null;
  notes: string | null;
}) {
  return {
    id: row.id,
    type: "matter" as const,
    firmId: row.firmId,
    clientId: row.clientId,
    matterId: row.matterId,
    permission: row.permission,
    sharedAt: row.sharedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    notes: row.notes,
  };
}

function serializeDocShare(row: {
  id: string;
  firmId: string;
  clientId: string;
  matterId: string;
  documentId: string;
  permission: string;
  sharedAt: Date;
  revokedAt: Date | null;
  notes: string | null;
}) {
  return {
    id: row.id,
    type: "document" as const,
    firmId: row.firmId,
    clientId: row.clientId,
    matterId: row.matterId,
    documentId: row.documentId,
    permission: row.permission,
    sharedAt: row.sharedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    notes: row.notes,
  };
}
