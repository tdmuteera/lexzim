import { jsonError, jsonOk } from "@/lib/auth/http";
import { listActiveSystemUsers } from "@/lib/repos/firm-tasks";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/workflow/assignees — active system users for the task picker.
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const items = await listActiveSystemUsers(firmId);
    return jsonOk({ items });
  } catch (err) {
    return jsonError(err, request);
  }
}
