import { jsonError, jsonOk } from "@/lib/auth/http";
import { getAiUsageMonthSummary } from "@/lib/ai/budget";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Firm AI usage for the current UTC month (Settings → AI → Usage). */
export async function GET() {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const usage = await getAiUsageMonthSummary(firmId);
    return jsonOk({ usage });
  } catch (err) {
    return jsonError(err);
  }
}
