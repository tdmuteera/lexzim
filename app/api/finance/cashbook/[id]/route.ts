import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { deleteCashbookEntry } from "@/lib/repos/firm-finance";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const entry = await deleteCashbookEntry(firmId, id);
    if (!entry) throw new AuthError("not_found", "Cashbook entry not found.");

    await writeAuditLog({
      action: "business_cashbook.delete",
      firmId,
      userId: session.id,
      entityType: "business_cashbook_entry",
      entityId: id,
      metadata: { entryType: entry.entryType, amountCents: entry.amountCents },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
