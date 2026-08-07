import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeDocument } from "@/lib/documents/serialize";
import {
  matterDocumentStoragePath,
  sanitizeFileName,
  uploadFirmFile,
  validateUploadFile,
} from "@/lib/storage/firm-files";
import { createMatterEvent } from "@/lib/repos/timeline";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import {
  createDocumentRecord,
  getDocumentById,
  listDocumentsForMatter,
} from "@/lib/repos/documents";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertMatterDocAccess(
  firmId: string,
  matterId: string,
  userId: string,
  viewAll: boolean,
) {
  const allowed = await userCanAccessMatter(firmId, matterId, userId, viewAll);
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this matter.");
  }
  const matter = await getMatterById(firmId, matterId);
  if (!matter) {
    throw new AuthError("not_found", "Matter not found.");
  }
  return matter;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    await assertMatterDocAccess(firmId, matterId, session.id, canViewAllMatters(session));

    const rows = await listDocumentsForMatter(firmId, matterId);
    return jsonOk({
      items: rows.map((row) =>
        serializeDocument(row, { createdByName: row.createdByName }),
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.manage");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const matter = await assertMatterDocAccess(
      firmId,
      matterId,
      session.id,
      canViewAllMatters(session),
    );

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AuthError("validation", "Multipart field `file` is required.");
    }
    validateUploadFile(file);

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim()
        : file.name.replace(/\.[^.]+$/, "") || file.name;

    const documentId = randomUUID();
    const fileName = sanitizeFileName(file.name);
    const mimeType = file.type || "application/octet-stream";
    const storagePath = matterDocumentStoragePath({
      firmId,
      matterId,
      documentId,
      fileName,
    });

    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadFirmFile({
      storagePath,
      firmId,
      bytes,
      contentType: mimeType,
    });

    const row = await createDocumentRecord({
      id: documentId,
      firmId,
      matterId,
      clientId: matter.clientId,
      title,
      fileName,
      mimeType,
      storagePath,
      sizeBytes: file.size,
      docType: "uploaded",
      createdBy: session.id,
    });

    await createMatterEvent({
      firmId,
      matterId,
      eventType: "document",
      title: `Document uploaded: ${row.title}`,
      body: row.fileName,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "documents.upload",
      firmId,
      userId: session.id,
      entityType: "document",
      entityId: row.id,
      metadata: {
        matterId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        storagePath: row.storagePath,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getDocumentById(firmId, row.id);
    return jsonOk(
      {
        document: serializeDocument(full ?? row, {
          createdByName: full?.createdByName,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
