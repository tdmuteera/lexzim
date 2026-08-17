import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { createSignedDownloadUrl } from "@/lib/storage/firm-files";
import { getDocumentById } from "@/lib/repos/documents";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const row = await getDocumentById(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Document not found.");
    }

    const allowed = await userCanAccessMatter(
      firmId,
      row.matterId,
      session.id,
      canViewAllMatters(session),
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

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
