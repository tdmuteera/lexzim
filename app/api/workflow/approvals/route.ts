import { jsonError, jsonOk } from "@/lib/auth/http";
import { listApprovalsInbox } from "@/lib/workflow/approvals-inbox";
import { requirePermission } from "@/lib/rbac/guards";

/**
 * GET /api/workflow/approvals — unified approvals inbox for the current user.
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("dashboard.view");
    const items = await listApprovalsInbox(session);
    return jsonOk({ items });
  } catch (err) {
    return jsonError(err, request);
  }
}
