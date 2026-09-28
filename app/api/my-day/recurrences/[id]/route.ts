import { jsonError, jsonOk } from "@/lib/auth/http";
import { parseToday } from "@/lib/my-day/validation";
import { deleteMyDayRecurrence } from "@/lib/repos/my-day";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/my-day/recurrences/[id]?today= — stop repeating and clear future copies. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("dashboard.view");
    const { id } = await ctx.params;
    const today = parseToday(new URL(request.url).searchParams.get("today"));
    await deleteMyDayRecurrence(tenantFirmId(session), session.id, id, today);
    return jsonOk({ deleted: id });
  } catch (err) {
    return jsonError(err, request);
  }
}
