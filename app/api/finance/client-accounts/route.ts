import { jsonError, jsonOk } from "@/lib/auth/http";
import {
  canViewAllClientAccounts,
  requireAny,
} from "@/lib/rbac/guards";
import { listClientAccountSummaries } from "@/lib/repos/client-accounts";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * Finance → Client accounts index.
 * Finance override (or MP) sees all clients; others see assigned only.
 */
export async function GET(request: Request) {
  try {
    const session = await requireAny([
      "finance.view_all_client_accounts",
      "finance.view",
      "trust.view",
    ]);
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const viewAll = canViewAllClientAccounts(session);

    const items = await listClientAccountSummaries(firmId, {
      q,
      viewAll,
      userId: session.id,
      currency: session.firm.defaultCurrency || "USD",
    });

    return jsonOk({
      visibility: viewAll ? "all" : "assigned",
      labels: {
        trust: "Trust money (client liability; not firm fees)",
        fees: "Firm fee revenue",
        disbursements: "Client costs / disbursements",
      },
      items,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
