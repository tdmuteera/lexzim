import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { serializeDeadlineTemplate } from "@/lib/deadlines/serialize";
import { parseDeadlineTemplateInput } from "@/lib/deadlines/validation";
import {
  createDeadlineTemplate,
  listDeadlineTemplates,
} from "@/lib/repos/calendar";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") !== "all";
    const rows = await listDeadlineTemplates(firmId, activeOnly);
    return jsonOk({ items: rows.map(serializeDeadlineTemplate) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseDeadlineTemplateInput(body);
    const row = await createDeadlineTemplate(firmId, input);

    await writeAuditLog({
      action: "deadline_templates.create",
      firmId,
      userId: session.id,
      entityType: "deadline_template",
      entityId: row.id,
      metadata: {
        name: row.name,
        offsetDays: row.offsetDays,
        defaultEventType: row.defaultEventType,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ template: serializeDeadlineTemplate(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
