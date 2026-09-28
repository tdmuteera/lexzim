import { jsonError, jsonOk } from "@/lib/auth/http";
import { parseToday } from "@/lib/my-day/validation";
import { markMyDayReviewed } from "@/lib/repos/my-day";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** POST /api/my-day/review — hides the morning review panel for today. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("dashboard.view");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await markMyDayReviewed(tenantFirmId(session), session.id, parseToday(body.today));
    return jsonOk({ reviewed: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
