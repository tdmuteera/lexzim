import { jsonError, jsonOk } from "@/lib/auth/http";
import { assertFirmCashCode, firmCashLabel, listCashMovements } from "@/lib/repos/firm-cash";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET /api/finance/cash-accounts?code=1020 : GL balance and postings for one firm cash account. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const code = assertFirmCashCode(new URL(request.url).searchParams.get("code"));
    const movements = await listCashMovements(firmId, code);
    return jsonOk({
      code,
      label: firmCashLabel(code),
      balanceCents: movements[0]?.balanceAfterCents ?? 0,
      movements: movements.map((m) => ({
        ...m,
        entryDate: m.entryDate.toISOString(),
        postedAt: m.postedAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
