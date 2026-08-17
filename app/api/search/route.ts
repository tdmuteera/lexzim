import { jsonError, jsonOk } from "@/lib/auth/http";
import { requireSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/types";
import { searchClients, searchMatters } from "@/lib/repos/search";
import { canViewAllMatters } from "@/lib/rbac/guards";
import { hasPermission } from "@/lib/rbac/permissions";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limitRaw = Number(url.searchParams.get("limit") ?? "8");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;

    if (q.length < 2) {
      return jsonOk({
        q,
        clients: [],
        matters: [],
        items: [],
      });
    }

    const canClients = hasPermission(session, "clients.view");
    const canMatters = hasPermission(session, "matters.view");
    if (!canClients && !canMatters) {
      throw new AuthError("forbidden", "No search permissions.");
    }

    const [clients, matters] = await Promise.all([
      canClients ? searchClients(firmId, q, limit) : Promise.resolve([]),
      canMatters
        ? searchMatters({
            firmId,
            userId: session.id,
            viewAll: canViewAllMatters(session),
            q,
            limit,
          })
        : Promise.resolve([]),
    ]);

    return jsonOk({
      q,
      clients,
      matters,
      items: [...matters, ...clients],
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
