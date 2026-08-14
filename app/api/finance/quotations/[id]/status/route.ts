import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseQuoteStatusInput } from "@/lib/quotes/validation";
import { serializeQuotationDetail } from "@/lib/quotes/serialize";
import { getQuotation, updateQuotationStatus } from "@/lib/repos/quotations";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("finance.quote.manage");
    const firmId = tenantFirmId(session);
    const { id } = await params;
    const body = await request.json();
    const status = parseQuoteStatusInput(body);

    const updated = await updateQuotationStatus(firmId, id, status);
    if (!updated) throw new AuthError("not_found", "Quotation not found.");

    await writeAuditLog({
      action: "quotations.status",
      firmId,
      userId: session.id,
      entityType: "quotation",
      entityId: id,
      metadata: { status },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getQuotation(firmId, id);
    return jsonOk({ quotation: full ? serializeQuotationDetail(full) : null });
  } catch (err) {
    return jsonError(err);
  }
}
