import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeDeadlineTemplate } from "@/lib/deadlines/serialize";
import { parseDeadlineTemplateInput } from "@/lib/deadlines/validation";
import {
  deleteDeadlineTemplate,
  getDeadlineTemplate,
  updateDeadlineTemplate,
} from "@/lib/repos/calendar";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getDeadlineTemplate(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Deadline template not found.");
    }
    return jsonOk({ template: serializeDeadlineTemplate(row) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const input = parseDeadlineTemplateInput(body);

    const existing = await getDeadlineTemplate(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Deadline template not found.");
    }

    const row = await updateDeadlineTemplate(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Deadline template not found.");
    }

    await writeAuditLog({
      action: "deadline_templates.update",
      firmId,
      userId: session.id,
      entityType: "deadline_template",
      entityId: row.id,
      metadata: {
        name: row.name,
        offsetDays: row.offsetDays,
        isActive: row.isActive,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ template: serializeDeadlineTemplate(row) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const existing = await getDeadlineTemplate(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Deadline template not found.");
    }

    const deleted = await deleteDeadlineTemplate(firmId, id);
    if (!deleted) {
      throw new AuthError("not_found", "Deadline template not found.");
    }

    await writeAuditLog({
      action: "deadline_templates.delete",
      firmId,
      userId: session.id,
      entityType: "deadline_template",
      entityId: id,
      metadata: { name: existing.name },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err);
  }
}
