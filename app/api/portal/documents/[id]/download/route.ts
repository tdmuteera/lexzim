import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requirePortalSession } from "@/lib/portal/auth";
import { isPortalEnabled } from "@/lib/portal/config";
import { portalCanReadDocument } from "@/lib/portal/shares";
import { getDocumentById } from "@/lib/repos/documents";
import { createSignedDownloadUrl } from "@/lib/storage/firm-files";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Portal document download: only if an active document_portal_share exists
 * for the portal session firm_id + client_id.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requirePortalSession();
    const { id } = await context.params;

    const allowed = await portalCanReadDocument(session.firmId, session.clientId, id);
    if (!allowed) {
      throw new AuthError("forbidden", "This document is not shared with you.");
    }

    const row = await getDocumentById(session.firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Document not found.");
    }

    const url = new URL(request.url);
    const expiresIn = Math.min(
      Math.max(Number(url.searchParams.get("expiresIn") ?? "900") || 900, 60),
      3600,
    );

    const signedUrl = await createSignedDownloadUrl(row.storagePath, session.firmId, expiresIn);

    await writeAuditLog({
      action: "portal.document_download",
      firmId: session.firmId,
      userId: null,
      entityType: "document",
      entityId: row.id,
      metadata: {
        fileName: row.fileName,
        portalUserId: session.id,
        clientId: session.clientId,
        matterId: row.matterId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      signedUrl,
      fileName: row.fileName,
      mimeType: row.mimeType,
      expiresIn,
    });
  } catch (err) {
    return jsonError(err);
  }
}
