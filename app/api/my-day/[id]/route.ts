import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseDueDate, parseItemPatch, parseToday } from "@/lib/my-day/validation";
import {
  deleteMyDayItem,
  getMyDayItemDto,
  moveMyDayItem,
  setMyDayItemStatus,
  updateMyDayItem,
} from "@/lib/repos/my-day";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/my-day/[id]
 * action: done | reopen | drop | move (dueDate, null = Someday) | update (fields)
 */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;
    const body = (await request.json()) as Record<string, unknown>;
    const today = parseToday(body.today);
    const action = typeof body.action === "string" ? body.action : "update";

    if (action === "done") await setMyDayItemStatus(firmId, session.id, id, "done", today);
    else if (action === "reopen") await setMyDayItemStatus(firmId, session.id, id, "open", today);
    else if (action === "drop") await setMyDayItemStatus(firmId, session.id, id, "dropped", today);
    else if (action === "move") {
      await moveMyDayItem(firmId, session.id, id, parseDueDate(body.dueDate, today));
    } else if (action === "update") {
      await updateMyDayItem(firmId, session.id, id, parseItemPatch(body, today));
    } else {
      throw new AuthError("validation", "Unknown action.");
    }

    return jsonOk({ item: await getMyDayItemDto(firmId, session.id, id) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;
    await deleteMyDayItem(firmId, session.id, id);
    return jsonOk({ deleted: id });
  } catch (err) {
    return jsonError(err, request);
  }
}
