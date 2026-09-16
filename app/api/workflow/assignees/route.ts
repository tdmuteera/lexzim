import { jsonError, jsonOk } from "@/lib/auth/http";
import { listActiveSystemUsers } from "@/lib/repos/firm-tasks";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/workflow/assignees — active system users for task / calendar share pickers.
 */
export async function GET(request: Request) {
  try {
    const session = await requireAny([
      "dashboard.view",
      "calendar.view",
      "calendar.manage",
    ]);
    const firmId = tenantFirmId(session);
    const items = await listActiveSystemUsers(firmId);
    return jsonOk({ items });
  } catch (err) {
    return jsonError(err, request);
  }
}
