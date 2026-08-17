import { writeAuditLog } from "@/lib/auth/audit";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requirePortalSession } from "@/lib/portal/auth";
import { isPortalEnabled } from "@/lib/portal/config";
import {
  listPortalVisibleDocuments,
  listPortalVisibleMatters,
} from "@/lib/portal/shares";

/**
 * Portal: list only actively shared matters/documents for the signed-in
 * portal user's firm_id + client_id. Share-nothing when empty.
 */
export async function GET(request: Request) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requirePortalSession();
    const [matters, documents] = await Promise.all([
      listPortalVisibleMatters(session.firmId, session.clientId),
      listPortalVisibleDocuments(session.firmId, session.clientId),
    ]);

    await Promise.all(
      matters.map((m) =>
        writeAuditLog({
          action: "portal.matter_viewed",
          firmId: session.firmId,
          userId: null,
          entityType: "matter",
          entityId: m.matterId,
          metadata: {
            matterId: m.matterId,
            clientId: session.clientId,
            portalUserId: session.id,
          },
        }),
      ),
    );

    return jsonOk({
      defaultShareNothing: true,
      firmId: session.firmId,
      clientId: session.clientId,
      matters: matters.map((m) => ({
        shareId: m.shareId,
        permission: m.permission,
        sharedAt: m.sharedAt.toISOString(),
        id: m.matterId,
        title: m.title,
        status: m.status,
        areaOfLaw: m.areaOfLaw,
        matterNumber: m.matterNumber,
        nextHearingAt: m.nextHearingAt ? m.nextHearingAt.toISOString() : null,
      })),
      documents: documents.map((d) => ({
        shareId: d.shareId,
        permission: d.permission,
        sharedAt: d.sharedAt.toISOString(),
        id: d.documentId,
        title: d.title,
        fileName: d.fileName,
        mimeType: d.mimeType,
        matterId: d.matterId,
        sizeBytes: d.sizeBytes,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
