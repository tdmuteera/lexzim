import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeProformaDetail } from "@/lib/proforma/serialize";
import { getProforma } from "@/lib/repos/proformas";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;
    const row = await getProforma(firmId, id);
    if (!row) throw new AuthError("not_found", "Pro forma not found.");
    return jsonOk({ proforma: serializeProformaDetail(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}
