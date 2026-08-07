import { jsonError, jsonOk } from "@/lib/auth/http";
import { serializeProcedure } from "@/lib/procedures/serialize";
import { listMyProcedures } from "@/lib/repos/procedures";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Upcoming/overdue procedures for Dashboard (P1-10). */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const modeParam = url.searchParams.get("mode");
    const mode =
      modeParam === "upcoming" || modeParam === "overdue" || modeParam === "all_open"
        ? modeParam
        : "all_open";
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const rows = await listMyProcedures(firmId, session.id, {
      viewAll: canViewAllMatters(session),
      mode,
      limit,
    });

    return jsonOk({
      items: rows.map((row) =>
        serializeProcedure(row, {
          assigneeName: row.assigneeName,
          matterTitle: row.matterTitle,
        }),
      ),
      mode,
    });
  } catch (err) {
    return jsonError(err);
  }
}
