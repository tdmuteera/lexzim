import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getKnowledgeReportById } from "@/lib/repos/knowledge-reports";
import { requirePermission } from "@/lib/rbac/guards";
import { createSignedDownloadUrl } from "@/lib/storage/firm-files";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/knowledge/reports/[id]/download
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("knowledge.reports.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const row = await getKnowledgeReportById(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Report not found.");
    }

    const url = new URL(request.url);
    const expiresIn = Math.min(
      Math.max(Number(url.searchParams.get("expiresIn") ?? "3600") || 3600, 60),
      86400,
    );

    const signedUrl = await createSignedDownloadUrl(row.storagePath, firmId, expiresIn);

    await writeAuditLog({
      action: "knowledge.report.download",
      firmId,
      userId: session.id,
      entityType: "knowledge_report",
      entityId: row.id,
      metadata: { fileName: row.fileName },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      signedUrl,
      fileName: row.fileName,
      contentType: row.contentType,
      expiresIn,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
