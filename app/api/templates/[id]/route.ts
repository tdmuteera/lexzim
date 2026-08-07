import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeTemplate } from "@/lib/templates/serialize";
import { parseTemplateMetaInput } from "@/lib/templates/validation";
import {
  getTemplateById,
  listTemplateVersions,
  updateTemplateMeta,
} from "@/lib/repos/templates";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("templates.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getTemplateById(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Template not found.");
    }
    const versions = await listTemplateVersions(firmId, id);
    return jsonOk({
      template: serializeTemplate(row, {
        createdByName: row.createdByName,
        approvedByName: row.approvedByName,
      }),
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        storagePath: v.storagePath,
        changeNote: v.changeNote,
        createdAt: v.createdAt.toISOString(),
        approvedBy: v.approvedBy,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("templates.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getTemplateById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Template not found.");
    }

    const body = await request.json();
    const input = parseTemplateMetaInput(body);
    const row = await updateTemplateMeta(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Template not found.");
    }

    await writeAuditLog({
      action: "templates.update",
      firmId,
      userId: session.id,
      entityType: "template",
      entityId: row.id,
      metadata: { title: row.title, areaOfLaw: row.areaOfLaw },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getTemplateById(firmId, id);
    return jsonOk({
      template: serializeTemplate(full ?? row, {
        createdByName: full?.createdByName,
        approvedByName: full?.approvedByName,
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}
