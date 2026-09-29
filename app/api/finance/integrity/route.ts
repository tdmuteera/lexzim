import { jsonError, jsonOk } from "@/lib/auth/http";
import { runFinanceIntegrity } from "@/lib/finance/integrity";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET /api/finance/integrity : read-only cross-ledger reconciliation checks. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.gl.view");
    const firmId = tenantFirmId(session);
    return jsonOk(await runFinanceIntegrity(firmId));
  } catch (err) {
    return jsonError(err, request);
  }
}
