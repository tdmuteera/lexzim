import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { searchConflictCandidates } from "@/lib/repos/conflict-checks";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/conflict/search?q=
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("clients.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      throw new AuthError("validation", "Search query must be at least 2 characters.");
    }

    const items = await searchConflictCandidates(firmId, q);
    return jsonOk({ items, q });
  } catch (err) {
    return jsonError(err, request);
  }
}
