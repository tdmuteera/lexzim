import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseRecurringTemplateInput } from "@/lib/finance/recurring-validation";
import {
  createRecurringTemplate,
  listDueRecurringTemplates,
  listRecurringTemplates,
  runDueRecurringForFirm,
} from "@/lib/repos/finance-recurring";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const dueOnly = url.searchParams.get("due") === "1";
    const items = dueOnly
      ? await listDueRecurringTemplates(firmId)
      : await listRecurringTemplates(firmId);
    return jsonOk({ items }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const body = await request.json();

    if (body?.action === "run_due") {
      const results = await runDueRecurringForFirm(firmId, session.id);
      await writeAuditLog({
        action: "finance_recurring.run_due",
        firmId,
        userId: session.id,
        entityType: "finance_recurring",
        entityId: null,
        metadata: { count: results.length },
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({ results }, { request });
    }

    const input = parseRecurringTemplateInput(body);
    const template = await createRecurringTemplate(firmId, session.id, input);
    await writeAuditLog({
      action: "finance_recurring.create",
      firmId,
      userId: session.id,
      entityType: "finance_recurring_template",
      entityId: template.id,
      metadata: { kind: template.kind, mode: template.mode, name: template.name },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ template }, { status: 201, request });
  } catch (err) {
    return jsonError(err, request);
  }
}
