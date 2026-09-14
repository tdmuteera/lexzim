import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeDocument } from "@/lib/documents/serialize";
import { getClientById } from "@/lib/repos/clients";
import {
  createDocumentRecord,
  getDocumentById,
  listDocumentsForClient,
} from "@/lib/repos/documents";
import { requirePermission } from "@/lib/rbac/guards";
import {
  clientDocumentStoragePath,
  sanitizeFileName,
  uploadFirmFile,
  validateUploadFile,
} from "@/lib/storage/firm-files";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertClient(firmId: string, clientId: string) {
  const client = await getClientById(firmId, clientId);
  if (!client) {
    throw new AuthError("not_found", "Client not found.");
  }
  return client;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.view");
    const firmId = tenantFirmId(session);
    const { id: clientId } = await context.params;
    await assertClient(firmId, clientId);

    const rows = await listDocumentsForClient(firmId, clientId);
    return jsonOk({
      items: rows.map((row) => ({
        ...serializeDocument(row, { createdByName: row.createdByName }),
        matterNumber: row.matterNumber ?? null,
        matterTitle: row.matterTitle ?? null,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.manage");
    const firmId = tenantFirmId(session);
    const { id: clientId } = await context.params;
    await assertClient(firmId, clientId);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AuthError("validation", "Choose a file to upload.");
    }
    validateUploadFile(file);

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim()
        : file.name.replace(/\.[^.]+$/, "") || file.name;

    const docTypeRaw = form.get("docType");
    const docType =
      typeof docTypeRaw === "string" && docTypeRaw.trim()
        ? docTypeRaw.trim()
        : "uploaded";

    const documentId = randomUUID();
    const fileName = sanitizeFileName(file.name);
    const mimeType = file.type || "application/octet-stream";
    const storagePath = clientDocumentStoragePath({
      firmId,
      clientId,
      documentId,
      fileName,
    });

    await uploadFirmFile({
      storagePath,
      firmId,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: mimeType,
    });

    const row = await createDocumentRecord({
      id: documentId,
      firmId,
      matterId: null,
      clientId,
      title,
      fileName,
      mimeType,
      storagePath,
      sizeBytes: file.size,
      docType,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "documents.client_upload",
      firmId,
      userId: session.id,
      entityType: "document",
      entityId: row.id,
      metadata: { clientId, fileName: row.fileName, docType },
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
    return jsonError(err, request);
  }
}
