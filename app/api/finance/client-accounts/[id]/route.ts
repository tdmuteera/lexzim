import { jsonError, jsonOk } from "@/lib/auth/http";
import {
  canViewAllClientAccounts,
  requireAny,
} from "@/lib/rbac/guards";
import { getClientAccountDetail } from "@/lib/repos/client-accounts";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requireAny([
      "finance.view_all_client_accounts",
      "finance.view",
      "trust.view",
    ]);
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const url = new URL(request.url);
    const matterId = url.searchParams.get("matterId")?.trim() || undefined;
    const viewAll = canViewAllClientAccounts(session);

    const detail = await getClientAccountDetail(firmId, id, {
      viewAll,
      userId: session.id,
      currency: session.firm.defaultCurrency || "USD",
      matterId,
    });

    return jsonOk({
      visibility: viewAll ? "all" : "assigned",
      account: detail,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
