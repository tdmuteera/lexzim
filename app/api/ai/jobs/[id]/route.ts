import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getAiJob, listRecentAiJobs, serializeAiJob } from "@/lib/ai/jobs/enqueue";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/** Staff: get one AI job (same firm) or list recent when id=recent. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    if (id === "recent") {
      const rows = await listRecentAiJobs(firmId, 15);
      return jsonOk({ items: rows.map(serializeAiJob) });
    }

    const job = await getAiJob(firmId, id);
    if (!job) throw new AuthError("not_found", "Job not found.");
    return jsonOk({ job: serializeAiJob(job) });
  } catch (err) {
    return jsonError(err);
  }
}
