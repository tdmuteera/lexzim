import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requirePortalSession } from "@/lib/portal/auth";
import { isPortalEnabled } from "@/lib/portal/config";
import { createPortalInboxUpload } from "@/lib/portal/inbox";

type RouteContext = { params: Promise<{ matterId: string }> };

/**
 * Portal: upload a file into the matter quarantine inbox.
 * Requires active matter share with permission read_upload.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requirePortalSession();
    const { matterId } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AuthError("validation", "Multipart field `file` is required.");
    }
    const titleRaw = form.get("title");
    const title = typeof titleRaw === "string" ? titleRaw : null;

    const row = await createPortalInboxUpload({
      firmId: session.firmId,
      clientId: session.clientId,
      matterId,
      portalUserId: session.id,
      file,
      title,
    });

    const info = clientInfo(request);
    await writeAuditLog({
      action: "portal.inbox_upload",
      firmId: session.firmId,
      userId: null,
      entityType: "portal_inbox_upload",
      entityId: row.id,
      metadata: {
        matterId,
        clientId: session.clientId,
        portalUserId: session.id,
        fileName: row.fileName,
        sizeBytes: row.sizeBytes,
      },
      ipOrUserAgent: info,
    });

    return jsonOk({
      id: row.id,
      title: row.title,
      fileName: row.fileName,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      note: "File received in firm inbox. It is not published until staff accept it.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
