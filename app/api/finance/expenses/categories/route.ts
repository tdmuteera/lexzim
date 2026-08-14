import { jsonError, jsonOk } from "@/lib/auth/http";
import { listExpenseGlOptions } from "@/lib/finance/expense-gl-tree";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET() {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const options = await listExpenseGlOptions(firmId);
    return jsonOk({
      items: options.map((o) => ({
        code: o.code,
        label: o.label,
        glAccountId: o.glAccountId ?? null,
        band: o.band,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
