import { jsonError, jsonOk } from "@/lib/auth/http";
import { serializeParty } from "@/lib/parties/serialize";
import { searchParties } from "@/lib/repos/parties";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Firm party name search. Respects assigned-matter scoping. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const partyRole = url.searchParams.get("partyRole") ?? undefined;
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const rows = await searchParties(firmId, {
      q,
      partyRole,
      limit,
      viewAll,
      userId: session.id,
    });
    return jsonOk({
      items: rows.map((row) =>
        serializeParty(row, {
          matterTitle: row.matterTitle,
          clientDisplayName: row.clientDisplayName,
        }),
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}
