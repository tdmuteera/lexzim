import { jsonError, jsonOk } from "@/lib/auth/http";
import { getTrustOverview } from "@/lib/repos/trust";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/trust/overview
 * Firm-wide trust snapshot: master accounts, per-client balances, currency totals.
 */
export async function GET() {
  try {
    const session = await requirePermission("trust.view");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");

    const overview = await getTrustOverview(firmId);

    return jsonOk({
      overview,
      disclaimer:
        "Trust ledger only. Fee invoices and fee payments are never included.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
