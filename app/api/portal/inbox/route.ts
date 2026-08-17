import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isPortalEnabled } from "@/lib/portal/config";
import {
  acceptPortalInboxUpload,
  dismissPortalInboxUpload,
  listPortalInboxForMatter,
} from "@/lib/portal/inbox";
import { createMatterEvent } from "@/lib/repos/timeline";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * Staff: list portal inbox uploads for a matter.
 * GET /api/portal/inbox?matterId=&status=pending
 */
export async function GET(request: Request) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requireAny(["matters.edit", "matters.view", "documents.view"]);
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const matterId = url.searchParams.get("matterId")?.trim();
    if (!matterId) {
      throw new AuthError("validation", "matterId is required.");
    }
    const status = url.searchParams.get("status")?.trim() || undefined;
    const rows = await listPortalInboxForMatter(firmId, matterId, { status });
    return jsonOk({
      virusScanNote:
        "No automated malware scanning yet. Review files before opening; treat as untrusted.",
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        status: r.status,
        acceptedDocumentId: r.acceptedDocumentId,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Staff: accept or dismiss a portal inbox upload.
 * Body: { uploadId, action: "accept"|"dismiss" }
 */
export async function POST(request: Request) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requireAny(["matters.edit", "documents.manage"]);
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      uploadId?: string;
      action?: string;
    };
    if (!body.uploadId?.trim()) {
      throw new AuthError("validation", "uploadId is required.");
    }
    const info = clientInfo(request);

    if (body.action === "accept") {
      const { upload, documentId } = await acceptPortalInboxUpload({
        firmId,
        uploadId: body.uploadId.trim(),
        reviewedByUserId: session.id,
      });
      await createMatterEvent({
        firmId,
        matterId: upload.matterId,
        eventType: "note",
        title: "Portal upload accepted",
        body: `${upload.title} (${upload.fileName}) added to matter documents.`,
        eventAt: new Date(),
        createdBy: session.id,
      });
      await writeAuditLog({
        action: "portal.inbox_accepted",
        firmId,
        userId: session.id,
        entityType: "portal_inbox_upload",
        entityId: upload.id,
        metadata: {
          matterId: upload.matterId,
          documentId,
          fileName: upload.fileName,
        },
        ipOrUserAgent: info,
      });
      return jsonOk({
        upload: {
          id: upload.id,
          status: upload.status,
          acceptedDocumentId: documentId,
        },
      });
    }

    if (body.action === "dismiss") {
      const upload = await dismissPortalInboxUpload({
        firmId,
        uploadId: body.uploadId.trim(),
        reviewedByUserId: session.id,
      });
      await writeAuditLog({
        action: "portal.inbox_dismissed",
        firmId,
        userId: session.id,
        entityType: "portal_inbox_upload",
        entityId: upload.id,
        metadata: {
          matterId: upload.matterId,
          fileName: upload.fileName,
        },
        ipOrUserAgent: info,
      });
      return jsonOk({
        upload: { id: upload.id, status: upload.status },
      });
    }

    throw new AuthError("validation", 'action must be "accept" or "dismiss".');
  } catch (err) {
    return jsonError(err, request);
  }
}
