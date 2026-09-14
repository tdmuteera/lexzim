import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { loadAccessibleDocument } from "@/lib/documents/access";
import { createSignedDownloadUrl } from "@/lib/storage/firm-files";
import {
  canViewAllClients,
  canViewAllMatters,
  requirePermission,
} from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const row = await loadAccessibleDocument(firmId, id, session.id, {
      viewAllMatters: canViewAllMatters(session),
      viewAllClients: canViewAllClients(session),
    });

    const url = new URL(request.url);
    const expiresIn = Math.min(
      Math.max(Number(url.searchParams.get("expiresIn") ?? "3600") || 3600, 60),
      86400,
    );

    const signedUrl = await createSignedDownloadUrl(row.storagePath, firmId, expiresIn);

    await writeAuditLog({
      action: "documents.download",
      firmId,
      userId: session.id,
      entityType: "document",
      entityId: row.id,
      metadata: { fileName: row.fileName },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      signedUrl,
      fileName: row.fileName,
      mimeType: row.mimeType,
      expiresIn,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
