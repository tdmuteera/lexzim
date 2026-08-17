import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { createSignedDownloadUrl } from "@/lib/storage/firm-files";
import { getTemplateById } from "@/lib/repos/templates";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("templates.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getTemplateById(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Template not found.");
    }

    const signedUrl = await createSignedDownloadUrl(row.storagePath, firmId, 3600);

    await writeAuditLog({
      action: "templates.download",
      firmId,
      userId: session.id,
      entityType: "template",
      entityId: row.id,
      metadata: { title: row.title, version: row.version },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      signedUrl,
      fileName: `${row.title.replace(/[^\w\- ]+/g, "").trim() || "template"}.docx`,
      version: row.version,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
