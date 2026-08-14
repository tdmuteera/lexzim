import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeQuotationDetail } from "@/lib/quotes/serialize";
import { getQuotation } from "@/lib/repos/quotations";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id } = await params;
    const row = await getQuotation(firmId, id);
    if (!row) throw new AuthError("not_found", "Quotation not found.");
    return jsonOk({ quotation: serializeQuotationDetail(row) });
  } catch (err) {
    return jsonError(err);
  }
}
