import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeTemplate } from "@/lib/templates/serialize";
import {
  approveTemplate,
  getTemplateById,
} from "@/lib/repos/templates";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("templates.manage");
    if (session.role.code !== "managing_partner") {
      throw new AuthError(
        "forbidden",
        "Only a Managing Partner can approve templates.",
      );
    }

    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getTemplateById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Template not found.");
    }

    const row = await approveTemplate(firmId, id, session.id);
    if (!row) {
      throw new AuthError("not_found", "Template not found.");
    }

    await writeAuditLog({
      action: "templates.approve",
      firmId,
      userId: session.id,
      entityType: "template",
      entityId: row.id,
      metadata: { title: row.title, version: row.version },
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
