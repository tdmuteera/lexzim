import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeDocument } from "@/lib/documents/serialize";
import { deleteFirmFile } from "@/lib/storage/firm-files";
import { createMatterEvent } from "@/lib/repos/timeline";
import { userCanAccessMatter } from "@/lib/repos/matters";
import {
  deleteDocumentRecord,
  getDocumentById,
  renameDocument,
} from "@/lib/repos/documents";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function loadAccessibleDocument(
  firmId: string,
  documentId: string,
  userId: string,
  viewAll: boolean,
) {
  const row = await getDocumentById(firmId, documentId);
  if (!row) {
    throw new AuthError("not_found", "Document not found.");
  }
  const allowed = await userCanAccessMatter(firmId, row.matterId, userId, viewAll);
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this matter.");
  }
  return row;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await loadAccessibleDocument(
      firmId,
      id,
      session.id,
      canViewAllMatters(session),
    );
    return jsonOk({
      document: serializeDocument(row, { createdByName: row.createdByName }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    await loadAccessibleDocument(firmId, id, session.id, canViewAllMatters(session));

    const body = (await request.json()) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      throw new AuthError("validation", "Title is required.");
    }

    const row = await renameDocument(firmId, id, title);
    if (!row) {
      throw new AuthError("not_found", "Document not found.");
    }

    await writeAuditLog({
      action: "documents.rename",
      firmId,
      userId: session.id,
      entityType: "document",
      entityId: row.id,
      metadata: { title: row.title, fileName: row.fileName },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getDocumentById(firmId, id);
    return jsonOk({
      document: serializeDocument(full ?? row, { createdByName: full?.createdByName }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await loadAccessibleDocument(
      firmId,
      id,
      session.id,
      canViewAllMatters(session),
    );

    await deleteFirmFile(existing.storagePath, firmId);
    const row = await deleteDocumentRecord(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Document not found.");
    }

    await createMatterEvent({
      firmId,
      matterId: row.matterId,
      eventType: "document",
      title: `Document deleted: ${row.title}`,
      body: row.fileName,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "documents.delete",
      firmId,
      userId: session.id,
      entityType: "document",
      entityId: row.id,
      metadata: {
        matterId: row.matterId,
        fileName: row.fileName,
        storagePath: row.storagePath,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true, id: row.id });
  } catch (err) {
    return jsonError(err);
  }
}
