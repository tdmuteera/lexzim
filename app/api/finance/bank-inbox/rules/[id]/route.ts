import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseBankRuleInput } from "@/lib/finance/bank-inbox-validation";
import { deleteBankRule, updateBankRule } from "@/lib/repos/bank-statements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const input = parseBankRuleInput(await request.json());
    const rule = await updateBankRule(firmId, id, input);
    if (!rule) throw new AuthError("not_found", "Rule not found.");

    await writeAuditLog({
      action: "bank_inbox.rule_update",
      firmId,
      userId: session.id,
      entityType: "bank_match_rule",
      entityId: id,
      metadata: { name: rule.name },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ rule }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const rule = await deleteBankRule(firmId, id);
    if (!rule) throw new AuthError("not_found", "Rule not found.");

    await writeAuditLog({
      action: "bank_inbox.rule_delete",
      firmId,
      userId: session.id,
      entityType: "bank_match_rule",
      entityId: id,
      metadata: { name: rule.name },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ ok: true }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}
