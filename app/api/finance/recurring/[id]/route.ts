import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseRecurringTemplateInput } from "@/lib/finance/recurring-validation";
import {
  deleteRecurringTemplate,
  getRecurringTemplate,
  runRecurringTemplate,
  updateRecurringTemplate,
} from "@/lib/repos/finance-recurring";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const template = await getRecurringTemplate(firmId, id);
    if (!template) throw new AuthError("not_found", "Template not found.");
    return jsonOk({ template }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const input = parseRecurringTemplateInput(await request.json());
    const template = await updateRecurringTemplate(firmId, id, input);
    if (!template) throw new AuthError("not_found", "Template not found.");
    await writeAuditLog({
      action: "finance_recurring.update",
      firmId,
      userId: session.id,
      entityType: "finance_recurring_template",
      entityId: id,
      metadata: { name: template.name },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ template }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const template = await deleteRecurringTemplate(firmId, id);
    if (!template) throw new AuthError("not_found", "Template not found.");
    await writeAuditLog({
      action: "finance_recurring.delete",
      firmId,
      userId: session.id,
      entityType: "finance_recurring_template",
      entityId: id,
      metadata: { name: template.name },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ ok: true }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      forceCreate?: boolean;
    };
    if (body.action !== "run") {
      throw new AuthError("validation", "Supported action: run.");
    }
    const result = await runRecurringTemplate(firmId, id, session.id, {
      forceCreate: body.forceCreate === true,
      ignoreDueDate: true,
    });
    await writeAuditLog({
      action: "finance_recurring.run",
      firmId,
      userId: session.id,
      entityType: "finance_recurring_template",
      entityId: id,
      metadata: {
        created: result.created,
        entityType: result.entityType,
        entityId: result.entityId,
      },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk(result, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}
