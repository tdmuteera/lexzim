import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseBankRuleInput } from "@/lib/finance/bank-inbox-validation";
import { createBankRule, listBankRules } from "@/lib/repos/bank-statements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const items = await listBankRules(firmId);
    return jsonOk({ items }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const input = parseBankRuleInput(await request.json());
    const rule = await createBankRule(firmId, session.id, input);

    await writeAuditLog({
      action: "bank_inbox.rule_create",
      firmId,
      userId: session.id,
      entityType: "bank_match_rule",
      entityId: rule.id,
      metadata: { name: rule.name, action: rule.action },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ rule }, { status: 201, request });
  } catch (err) {
    return jsonError(err, request);
  }
}
